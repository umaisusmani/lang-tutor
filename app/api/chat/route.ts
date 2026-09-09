import { groq } from '@ai-sdk/groq';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

import { CONVERSATION_SYSTEM_PROMPT } from '@/lib/prompts';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: groq('llama-3.3-70b-versatile'),
    system: CONVERSATION_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
