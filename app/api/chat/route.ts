import { groq } from '@ai-sdk/groq';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import { cookies } from 'next/headers';

import type { LangTutorUIMessage } from '@/lib/chat-types';
import { glossText } from '@/lib/gloss';
import { buildConversationSystemPrompt } from '@/lib/prompts';
import { recordMistake } from '@/lib/services/mistake.service';
import { getCurrentUserId, resolveCefrLevel } from '@/lib/services/profile.service';
import { ANON_MESSAGE_CAP, checkAndIncrementUsage, getSessionId } from '@/lib/services/session.service';
import { logUsage } from '@/lib/services/usage.service';
import { detectCorrection } from '@/lib/tutor';

const CHAT_MODEL = 'openai/gpt-oss-120b';

function lastUserMessageText(messages: LangTutorUIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return last.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export async function POST(req: Request) {
  const { messages }: { messages: LangTutorUIMessage[] } = await req.json();

  const userId = await getCurrentUserId();

  // Rate limit check happens before anything else -- specifically before any
  // Groq call -- so a capped-out anonymous visitor costs us zero tokens, not
  // just zero *visible* reply. Signed-in users skip this entirely; the cap
  // only exists to protect against unauthenticated traffic.
  if (!userId) {
    const sessionId = await getSessionId();
    const { allowed } = await checkAndIncrementUsage(sessionId);

    if (!allowed) {
      const stream = createUIMessageStream<LangTutorUIMessage>({
        execute: async ({ writer }) => {
          writer.write({
            type: 'data-rateLimited',
            id: 'rate-limit-1',
            data: { cap: ANON_MESSAGE_CAP },
          });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
  }

  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(userId, levelCookie);

  const userText = lastUserMessageText(messages);

  const stream = createUIMessageStream<LangTutorUIMessage>({
    execute: async ({ writer }) => {
      // Correction detection analyses the user's own message, so it needs
      // nothing from the reply — kick it off now, concurrently with the
      // reply stream below, rather than waiting for the reply to finish
      // first. IMPORTANT: `writer.merge()` is fire-and-forget (returns
      // void), and the overall response closes once this `execute` function
      // returns — so this promise must be awaited below (alongside the
      // reply) or a slow correction call gets silently dropped: the stream
      // closes before its `writer.write()` ever runs. Learned this the hard
      // way — first version had no await here and the correction simply
      // never reached the client.
      const correctionDone = userText.trim()
        ? detectCorrection(userText, level, { userId })
            .then(async (correction) => {
              writer.write({ type: 'data-correction', id: 'correction-1', data: correction });
              await recordMistake(userId, userText, correction);
            })
            .catch((err) => {
              // A failed correction check shouldn't take down the whole
              // response -- the conversation reply still matters more.
              console.error('[correction] failed:', err);
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
      // running from the top of execute(). It's still not sequential from the
      // client's point of view -- the reply has already fully streamed to the
      // browser by the time this starts -- it's just sequential relative to
      // the reply's own completion, which is unavoidable.
      const glossDone = Promise.resolve(result.text)
        .then((replyText) => glossText(replyText, { userId }))
        .then((gloss) => {
          writer.write({ type: 'data-gloss', id: 'gloss-1', data: gloss });
        })
        .catch((err) => {
          // Same rationale as the correction catch below: a failed gloss
          // must not take down a reply the user already received.
          console.error('[gloss] failed:', err);
        });

      // `result.text` resolves once generation is complete, giving us a
      // promise to wait on for "the reply is done" without disturbing the
      // merge above. Waiting on all three concurrently (not sequentially) is
      // the whole point -- this isn't `await correctionDone; await result.text`.
      // Omitting any one of these three from this Promise.all reproduces the
      // exact bug documented above: whichever one resolves last gets its
      // writer.write() silently dropped once the stream closes.
      await Promise.all([correctionDone, result.text, glossDone]);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
