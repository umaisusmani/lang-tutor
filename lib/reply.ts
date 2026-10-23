import { groq } from '@ai-sdk/groq';

import type { PersonaProfile } from '@/lib/personas';
import { buildConversationSystemPrompt, buildTurnGuidance, type CefrLevel } from '@/lib/prompts';

export const CHAT_MODEL = 'openai/gpt-oss-120b';

/**
 * Everything about the conversation call except the messages and the
 * streaming: model, system prompt, provider options. Shared so the eval runner
 * (evals/reply-level-cases.ts) calls the model exactly as chat does -- it
 * can't import lib/services/chat.service.ts, which pulls in the Supabase
 * server client.
 */
export function replySettings(
  level: CefrLevel,
  persona: PersonaProfile,
  /** Her last two replies in this chat, newest first -- see buildTurnGuidance(). */
  previousReply?: string,
  replyBeforePrevious?: string,
) {
  const turnGuidance = buildTurnGuidance(previousReply, replyBeforePrevious);
  return {
    model: groq(CHAT_MODEL),
    system: turnGuidance
      ? `${buildConversationSystemPrompt(level, persona)}\n\nThis turn:\n${turnGuidance}`
      : buildConversationSystemPrompt(level, persona),
    providerOptions: {
      // Groq defaults to raw reasoning, which can put the model's planning
      // into the same text stream as the German reply.
      groq: { reasoningEffort: 'low' as const, reasoningFormat: 'hidden' as const },
    },
  };
}
