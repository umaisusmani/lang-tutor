import { cookies } from 'next/headers';

import { streamAskAnswer } from '@/lib/ask';
import { isCefrLevel } from '@/lib/prompts';
import { getCurrentUserId, resolveCefrLevel } from '@/lib/services/profile.service';
import { consumeMessage, getQuotaStatus } from '@/lib/services/session.service';

const MAX_BODY_CHARS = 9000;
const MAX_QUESTION_CHARS = 500;
const MAX_CHAT_MESSAGES = 6;
const MAX_PANEL_TURNS = 4;
const MAX_CONTEXT_MESSAGE_CHARS = 420;

type ContextMessage = { role: 'user' | 'assistant'; content: string };

function cleanMessages(value: unknown, count: number): ContextMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-count)
    .flatMap((item): ContextMessage[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (record.role !== 'user' && record.role !== 'assistant') return [];
      if (typeof record.content !== 'string') return [];
      const content = record.content.trim().slice(0, MAX_CONTEXT_MESSAGE_CHARS);
      return content ? [{ role: record.role, content }] : [];
    });
}

function formatContext(messages: ContextMessage[]): string {
  return messages.map(({ role, content }) => `${role}: ${content}`).join('\n');
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return Response.json({ error: `Question must be 1–${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: 'Sign in to use Ask.' }, { status: 401 });
  }
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const requestedLevel = typeof record.level === 'string' ? record.level : undefined;
  const level = isCefrLevel(requestedLevel)
    ? requestedLevel
    : await resolveCefrLevel(userId, levelCookie);

  // Signed-in learners pay from the same daily allowance as chat and explanations.
  // This check happens before the model call so capped requests cost no tokens.
  const usage = await consumeMessage(userId);
  const quota = await getQuotaStatus(userId);
  if (!usage.allowed) quota.reason = usage.reason;
  if (!usage.allowed) {
    return Response.json(
      { quota, error: usage.reason === 'unavailable' ? 'Could not check your message allowance.' : 'Daily message limit reached.', reason: usage.reason, signedIn: true },
      { status: usage.reason === 'unavailable' ? 503 : 429 },
    );
  }

  const chatContext = formatContext(cleanMessages(record.chatContext, MAX_CHAT_MESSAGES));
  const panelContext = formatContext(cleanMessages(record.panelContext, MAX_PANEL_TURNS));
  const result = streamAskAnswer({
    question,
    level,
    chatContext,
    panelContext,
    usageContext: { userId },
  });

  return result.toTextStreamResponse({
    headers: { 'X-Messages-Remaining': String(usage.remaining), 'X-Quota-Status': JSON.stringify(quota) },
  });
}
