import { cookies } from 'next/headers';

import { streamGrammarExplanation, type ExplainKind } from '@/lib/explain';
import { isCefrLevel } from '@/lib/prompts';
import { annotateMessage, getMessage } from '@/lib/services/conversation.service';
import { getCurrentUserId, resolveCefrLevel } from '@/lib/services/profile.service';
import { checkAndIncrementUsage, getSessionId } from '@/lib/services/session.service';

/** Longest text an unpersisted request may ask about. Replies are a few
 * sentences; this only stops the endpoint being used as a free model proxy. */
const MAX_TEXT_LENGTH = 1500;

function isKind(value: unknown): value is ExplainKind {
  return value === 'reply' || value === 'correction';
}

function clip(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT_LENGTH) : '';
}

/**
 * The "explain grammar" button. Streams plain text.
 *
 * Two ways in:
 * - Signed in, with a message id: the text is read from that row -- not
 *   taken from the request -- and the answer is saved back onto it, so asking
 *   again (or after a reload) costs nothing. getMessage() goes through RLS,
 *   so another user's id reads as missing; no ownership check needed here.
 * - Anonymous, or a turn whose rows didn't save: the text comes from the
 *   request and nothing is stored. Anonymous requests count against the same
 *   free-message cap as chat, checked before any model call.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !isKind(body.kind)) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const kind: ExplainKind = body.kind;

  const userId = await getCurrentUserId();
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = isCefrLevel(body.level) ? body.level : await resolveCefrLevel(userId, levelCookie);

  let text = clip(body.text);
  let original = clip(body.original);
  let persist: ((explanation: string) => Promise<void>) | undefined;

  if (userId && typeof body.messageId === 'string') {
    const row = await getMessage(body.messageId);
    // The reply's explanation lives on the assistant row; a correction's on
    // the user row, next to the correction itself (see 0004).
    const expectedRole = kind === 'reply' ? 'assistant' : 'user';
    if (!row || row.role !== expectedRole) {
      return Response.json({ error: 'Message not found.' }, { status: 404 });
    }

    if (row.grammar_explanation) {
      return new Response(row.grammar_explanation, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (kind === 'reply') {
      text = row.content;
    } else {
      if (!row.correction?.correction) {
        return Response.json({ error: 'No correction to explain.' }, { status: 404 });
      }
      text = row.correction.correction;
      original = row.content;
    }
    persist = (explanation) => annotateMessage(row.id, { grammar_explanation: explanation });
  } else if (!userId) {
    const sessionId = await getSessionId();
    const { allowed } = await checkAndIncrementUsage(sessionId);
    if (!allowed) {
      return Response.json({ error: 'Free message limit reached.' }, { status: 429 });
    }
  }

  if (!text.trim()) {
    return Response.json({ error: 'Nothing to explain.' }, { status: 400 });
  }

  const result = streamGrammarExplanation({
    kind,
    text,
    original,
    level,
    usageContext: { userId },
    onText: persist,
  });

  return result.toTextStreamResponse();
}
