import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { cookies } from 'next/headers';

import type { LangTutorUIMessage } from '@/lib/chat-types';
import { MAX_CHAT_BODY_CHARS, parseChatRequest } from '@/lib/chat-request';
import { runChatTurn, startChatTurn } from '@/lib/services/chat.service';
import {
  getCurrentUserId,
  resolveCefrLevel,
  updateCefrLevel,
} from '@/lib/services/profile.service';
import { consumeMessage } from '@/lib/services/session.service';

/**
 * Controller for the chat endpoint: parse the request, work out who is asking,
 * enforce the daily limits, and shape the streaming response. The turn itself --
 * persistence, the reply, corrections, glosses, vocab -- lives in
 * lib/services/chat.service.ts.
 */
export async function POST(req: Request) {
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_BODY_CHARS) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_CHAT_BODY_CHARS) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = parseChatRequest(input);
  if (!parsed) return Response.json({ error: 'Invalid request.' }, { status: 400 });

  const { messages, conversationId, level: requestedLevel } = parsed;

  const userId = await getCurrentUserId();

  // The daily limit is checked before anything else -- specifically before any
  // Groq call -- so a capped-out caller costs us zero tokens, not just zero
  // *visible* reply. Applies to everyone: signed-in users have their own,
  // larger daily cap, and all traffic shares the global budget cap.
  const usage = await consumeMessage(userId);

  if (!usage.allowed) {
    const stream = createUIMessageStream<LangTutorUIMessage>({
      execute: async ({ writer }) => {
        writer.write({
          type: 'data-rateLimited',
          id: 'rate-limit-1',
          data: { cap: usage.cap, reason: usage.reason, signedIn: userId !== null },
        });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // The level the learner is looking at wins over the stored one. It used to
  // be read only from the profile (signed in) or cookie, and the dropdown
  // saved the profile with a Server Action nobody awaited -- so a message
  // sent right after changing level could overtake that save and be answered
  // at the old level. Sending it with the message removes the race; it's
  // validated like the cookie is, since it ends up in a system prompt.
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const storedLevel = await resolveCefrLevel(userId, levelCookie);
  const level = requestedLevel ?? storedLevel;

  // Keep the profile in step, so the next page load opens at this level even
  // if the dropdown's own save was the one that got lost.
  if (userId && level !== storedLevel) await updateCefrLevel(userId, level);

  const turn = await startChatTurn({ userId, level, messages, conversationId });

  const stream = createUIMessageStream<LangTutorUIMessage>({
    // Returned, not fired-and-forgotten: the response stays open until this
    // promise settles, which is how the service's late writes (correction,
    // gloss, vocab) make it to the client at all.
    execute: ({ writer }) => runChatTurn(turn, writer),
  });

  return createUIMessageStreamResponse({ stream });
}
