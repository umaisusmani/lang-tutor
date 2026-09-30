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
  /** Her last reply in this chat, if any -- see buildTurnGuidance(). */
  previousReply?: string,
) {
  const turnGuidance = buildTurnGuidance(previousReply);
  return {
    model: groq(CHAT_MODEL),
    system: turnGuidance
      ? `${buildConversationSystemPrompt(level, persona)}\n\nThis turn:\n${turnGuidance}`
      : buildConversationSystemPrompt(level, persona),
    providerOptions: {
      // A conversational reply doesn't need deep multi-step reasoning;
      // keeping effort low cuts wasted reasoning tokens against Groq's
      // per-minute cap.
      groq: { reasoningEffort: 'low' as const },
    },
  };
}
