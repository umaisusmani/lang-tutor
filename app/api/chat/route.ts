import { groq } from '@ai-sdk/groq';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import { cookies } from 'next/headers';

import type { LangTutorUIMessage } from '@/lib/chat-types';
import { buildConversationSystemPrompt, DEFAULT_CEFR_LEVEL, isCefrLevel } from '@/lib/prompts';
import { detectCorrection } from '@/lib/tutor';
import { logUsage } from '@/lib/usage';

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

  // Anonymous users get their level via a cookie (no DB until step 3).
  // Validated against the known set rather than trusted blindly — a cookie
  // is client-controlled, so a bad/tampered value should fall back safely
  // rather than get interpolated into the prompt as-is.
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = isCefrLevel(levelCookie) ? levelCookie : DEFAULT_CEFR_LEVEL;

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
        ? detectCorrection(userText, level)
            .then((correction) => {
              writer.write({ type: 'data-correction', id: 'correction-1', data: correction });
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
        onFinish: ({ totalUsage }) => logUsage('chat', CHAT_MODEL, totalUsage),
      });

      writer.merge(result.toUIMessageStream());

      // `result.text` resolves once generation is complete, giving us a
      // promise to wait on for "the reply is done" without disturbing the
      // merge above. Waiting on both concurrently (not sequentially) is the
      // whole point -- this isn't `await correctionDone; await result.text`.
      await Promise.all([correctionDone, result.text]);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
