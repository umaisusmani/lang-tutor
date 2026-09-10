import { groq } from '@ai-sdk/groq';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';

import { buildConversationSystemPrompt, DEFAULT_CEFR_LEVEL, isCefrLevel } from '@/lib/prompts';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Anonymous users get their level via a cookie (no DB until step 3).
  // Validated against the known set rather than trusted blindly — a cookie
  // is client-controlled, so a bad/tampered value should fall back safely
  // rather than get interpolated into the prompt as-is.
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = isCefrLevel(levelCookie) ? levelCookie : DEFAULT_CEFR_LEVEL;

  const result = streamText({
    model: groq('openai/gpt-oss-120b'),
    system: buildConversationSystemPrompt(level),
    messages: await convertToModelMessages(messages),
    providerOptions: {
      // A conversational reply doesn't need deep multi-step reasoning; keeping
      // effort low cuts wasted reasoning tokens against Groq's per-minute cap.
      groq: { reasoningEffort: 'low' },
    },
  });

  return result.toUIMessageStreamResponse();
}
