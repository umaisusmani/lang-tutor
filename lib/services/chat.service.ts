import { groq } from '@ai-sdk/groq';
import { convertToModelMessages, streamText, type UIMessageStreamWriter } from 'ai';

import type { LangTutorUIMessage, NoticeSource } from '@/lib/chat-types';
import { glossText } from '@/lib/gloss';
import { buildConversationSystemPrompt, type CefrLevel } from '@/lib/prompts';
import {
  annotateMessage,
  createConversation,
  getConversation,
  saveMessage,
} from '@/lib/services/conversation.service';
import { recordMistake } from '@/lib/services/mistake.service';
import { logUsage } from '@/lib/services/usage.service';
import { getSavedLemmas } from '@/lib/services/vocab.service';
import { detectCorrection } from '@/lib/tutor';
import type { Conversation } from '@/lib/types/db';

/**
 * Orchestrates one chat turn: persistence, the reply stream, and the
 * correction / gloss / vocab passes that hang off it.
 *
 * Unlike the other services this doesn't wrap a table -- it sequences the
 * others. app/api/chat/route.ts stays a controller (parse the request, gate
 * anonymous traffic, build the response) and hands the work here.
 */

const CHAT_MODEL = 'openai/gpt-oss-120b';

/**
 * Tells the learner a background step failed, without touching the reply.
 *
 * Transient (see the `notice` part in chat-types.ts). Wrapped in its own
 * try/catch because this is called from inside the `.catch` handlers below:
 * if the stream is already broken, letting this throw would turn "the gloss
 * failed" into "the whole response rejected", which is exactly what those
 * handlers exist to prevent.
 */
function notify(
  writer: UIMessageStreamWriter<LangTutorUIMessage>,
  source: NoticeSource,
  message: string,
) {
  try {
    writer.write({ type: 'data-notice', data: { source, message }, transient: true });
  } catch (err) {
    console.error('[notice] write failed:', err);
  }
}

export type ChatTurn = {
  userId: string | null;
  level: CefrLevel;
  messages: LangTutorUIMessage[];
  userText: string;
  conversation: Conversation | null;
  userMessageId: string | null;
};

export function lastUserMessageText(messages: LangTutorUIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return last.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/**
 * Everything that has to happen before the stream opens: work out which
 * conversation this turn belongs to and store what the learner wrote.
 */
export async function startChatTurn(input: {
  userId: string | null;
  level: CefrLevel;
  messages: LangTutorUIMessage[];
  conversationId?: string | null;
}): Promise<ChatTurn> {
  const { userId, level, messages, conversationId } = input;
  const userText = lastUserMessageText(messages);

  // Signed-in users get their turns persisted. The client sends the id of the
  // conversation it's showing; absent (a brand new chat) we create one, titled
  // from this first message. A forged id can't do damage -- the RLS policy on
  // messages proves ownership through the parent conversation, so an insert
  // naming someone else's conversation is rejected outright.
  let conversation: Conversation | null = null;
  if (userId) {
    conversation = conversationId
      ? await getConversation(conversationId)
      : await createConversation(userId, userText);
  }

  // Saved before anything downstream runs: what the learner wrote is worth
  // keeping even if the reply, correction and gloss all fail. Its id comes
  // back so the correction can be attached to it once that call resolves.
  const userMessageId = conversation
    ? await saveMessage(conversation.id, 'user', userText)
    : null;

  return { userId, level, messages, userText, conversation, userMessageId };
}

/**
 * Runs the turn against an open stream. The returned promise settles only once
 * every write has happened, so the caller must hand it straight back to
 * createUIMessageStream's `execute` -- the response closes when that promise
 * settles.
 */
export async function runChatTurn(
  turn: ChatTurn,
  writer: UIMessageStreamWriter<LangTutorUIMessage>,
): Promise<void> {
  const { userId, level, messages, userText, conversation, userMessageId } = turn;

  // Tells the client which conversation this landed in, so a brand new
  // chat's second message appends to the same one instead of forking a
  // fresh conversation every turn.
  if (conversation) {
    writer.write({
      type: 'data-conversation',
      id: 'conversation-1',
      data: { id: conversation.id },
    });
  }

  // A signed-in learner's turn that didn't make it into the database. Either
  // there's no conversation to put it in (creating one failed, or the id the
  // client sent belongs to a chat that's since been deleted) or the message
  // insert itself failed. The reply still streams normally either way, so
  // without this the chat looks fine and the turn is silently gone on reload.
  if (userId && userText.trim() && (!conversation || !userMessageId)) {
    notify(writer, 'history', "Couldn't save this message to your chat history.");
  }

  // Correction detection analyses the user's own message, so it needs
  // nothing from the reply — kick it off now, concurrently with the
  // reply stream below, rather than waiting for the reply to finish
  // first. IMPORTANT: `writer.merge()` is fire-and-forget (returns
  // void), and the overall response closes once this function's promise
  // settles — so this promise must be awaited below (alongside the
  // reply) or a slow correction call gets silently dropped: the stream
  // closes before its `writer.write()` ever runs. Learned this the hard
  // way — first version had no await here and the correction simply
  // never reached the client.
  const correctionDone = userText.trim()
    ? detectCorrection(userText, level, { userId })
        .then(async (correction) => {
          writer.write({ type: 'data-correction', id: 'correction-1', data: correction });

          // The corrected sentence's own gloss is saveable word-by-word too,
          // so it needs the same already-saved marks the reply's gloss gets.
          // Written from inside THIS chain rather than joined with the gloss
          // chain below: the two run concurrently and either may finish
          // first, and a write that waits on the slower one is a write that
          // can miss the stream close. Distinct ids keep them from
          // clobbering each other on the client.
          if (userId && correction.correctionGloss?.length) {
            const saved = await getSavedLemmas(
              userId,
              correction.correctionGloss.map((g) => g.lemma),
            );
            writer.write({ type: 'data-savedLemmas', id: 'saved-correction', data: saved });
          }

          await recordMistake(userId, userText, correction);
          // Attached to the USER's message row, since that's what it
          // describes -- app/page.tsx pairs it back up with the following
          // reply when rebuilding the thread.
          if (userMessageId) await annotateMessage(userMessageId, { correction });
        })
        .catch((err) => {
          // A failed correction check shouldn't take down the whole
          // response -- the conversation reply still matters more. But say
          // so: a missing correction card otherwise reads as "no mistake".
          console.error('[correction] failed:', err);
          notify(writer, 'correction', "Couldn't check your German this time.");
        })
    : Promise.resolve();

  const result = streamText({
    model: groq(CHAT_MODEL),
    system: buildConversationSystemPrompt(level),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      // A conversational reply doesn't need deep multi-step reasoning;
      // keeping effort low cuts wasted reasoning tokens against Groq's
      // per-minute cap.
      groq: { reasoningEffort: 'low' },
    },
    onFinish: ({ totalUsage }) => logUsage('chat', CHAT_MODEL, totalUsage, { userId }),
  });

  writer.merge(result.toUIMessageStream());

  // Reply gloss: unlike correction detection, this genuinely CANNOT start
  // until the reply text exists, so it chains off result.text rather than
  // running from the top. It's still not sequential from the client's point
  // of view -- the reply has already fully streamed to the browser by the
  // time this starts -- it's just sequential relative to the reply's own
  // completion, which is unavoidable.
  //
  // Persisting the reply chains off the same result.text the gloss uses,
  // and joins the Promise.all below for the same reason everything else
  // does: work started here that isn't awaited gets dropped when the stream
  // closes. Resolves to the new row's id so the gloss can be attached to it
  // below.
  const assistantSave = conversation
    ? Promise.resolve(result.text).then(async (replyText) => {
        const id = await saveMessage(conversation.id, 'assistant', replyText);
        // Written from inside this chain so it's awaited by the Promise.all
        // below -- a write made after the stream closes is silently dropped.
        if (!id && replyText.trim()) {
          notify(writer, 'history', "Couldn't save the tutor's reply to your chat history.");
        }
        return id;
      })
    : Promise.resolve(null);

  const glossDone = Promise.resolve(result.text)
    .then((replyText) => glossText(replyText, { userId }))
    .then(async (gloss) => {
      // Streamed to the client first, persisted second: the reader
      // shouldn't wait on a database round-trip to see it.
      writer.write({ type: 'data-gloss', id: 'gloss-1', data: gloss });
      const assistantId = await assistantSave;
      if (assistantId) await annotateMessage(assistantId, { gloss });

      // Every glossed word is saveable, so all the client needs is which
      // ones are already saved -- signed-in users only, since there's no
      // vocab_entries row to check against (or anywhere to save one) for an
      // anonymous visitor.
      //
      // DEPRECATED -- was getVocabCandidates() writing 'data-vocabCandidates'
      // for the chips under each reply; see app/components/vocab-chips.tsx.
      if (userId) {
        const saved = await getSavedLemmas(
          userId,
          gloss.map((g) => g.lemma),
        );
        writer.write({ type: 'data-savedLemmas', id: 'saved-reply', data: saved });
      }
    })
    .catch((err) => {
      // Same rationale as the correction catch above: a failed gloss
      // must not take down a reply the user already received.
      console.error('[gloss] failed:', err);
      notify(writer, 'gloss', "Couldn't translate the reply this time.");
    });

  // `result.text` resolves once generation is complete, giving us a
  // promise to wait on for "the reply is done" without disturbing the
  // merge above. Waiting on all of them concurrently (not sequentially) is
  // the whole point -- this isn't `await correctionDone; await result.text`.
  // Omitting any one of these from this Promise.all reproduces the exact bug
  // documented above: whichever one resolves last gets its writer.write()
  // silently dropped once the stream closes.
  await Promise.all([correctionDone, result.text, glossDone, assistantSave]);
}
