import { z } from 'zod';

import type { LangTutorUIMessage } from '@/lib/chat-types';
import { CEFR_LEVELS, type CefrLevel } from '@/lib/prompts';

export const MAX_CHAT_BODY_CHARS = 128_000;
export const MAX_CHAT_MESSAGES = 40;
export const MAX_CHAT_MESSAGE_CHARS = 4_000;
export const MAX_CHAT_TOTAL_TEXT_CHARS = 48_000;

const IncomingPartSchema = z.object({ type: z.string().min(1).max(80) }).passthrough();

const IncomingMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(['user', 'assistant']),
  parts: z.array(IncomingPartSchema).min(1).max(20),
});

const IncomingChatRequestSchema = z.object({
  messages: z.array(IncomingMessageSchema).min(1).max(MAX_CHAT_MESSAGES),
  conversationId: z.string().uuid().nullable().optional(),
  level: z.enum(CEFR_LEVELS).optional(),
});

export type ParsedChatRequest = {
  messages: LangTutorUIMessage[];
  conversationId?: string | null;
  level?: CefrLevel;
};

/**
 * Validates the public request and discards UI-only data parts before the
 * history reaches the model. The client needs those parts for rendering, but
 * the model only needs the text transcript.
 */
export function parseChatRequest(input: unknown): ParsedChatRequest | null {
  const result = IncomingChatRequestSchema.safeParse(input);
  if (!result.success) return null;

  let totalTextChars = 0;
  const messages: LangTutorUIMessage[] = [];

  for (const message of result.data.messages) {
    const parts: LangTutorUIMessage['parts'] = [];

    for (const part of message.parts) {
      if (part.type !== 'text') continue;
      if (typeof part.text !== 'string' || part.text.length > MAX_CHAT_MESSAGE_CHARS) return null;

      totalTextChars += part.text.length;
      if (totalTextChars > MAX_CHAT_TOTAL_TEXT_CHARS) return null;
      parts.push({ type: 'text', text: part.text });
    }

    if (parts.length === 0) return null;
    messages.push({ id: message.id, role: message.role, parts });
  }

  const last = messages.at(-1);
  const lastText = last?.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  if (last?.role !== 'user' || !lastText?.trim()) return null;

  return {
    messages,
    conversationId: result.data.conversationId,
    level: result.data.level,
  };
}
