import { groq } from '@ai-sdk/groq';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

import { CONVERSATION_SYSTEM_PROMPT } from '@/lib/prompts';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: groq('openai/gpt-oss-120b'),
    system: CONVERSATION_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    providerOptions: {
      // A conversational reply doesn't need deep multi-step reasoning; keeping
      // effort low cuts wasted reasoning tokens against Groq's per-minute cap.
      groq: { reasoningEffort: 'low' },
    },
  });

  return result.toUIMessageStreamResponse();
}
