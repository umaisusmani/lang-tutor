import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { cookies } from 'next/headers';

import type { LangTutorUIMessage } from '@/lib/chat-types';
import { runChatTurn, startChatTurn } from '@/lib/services/chat.service';
import { getCurrentUserId, resolveCefrLevel } from '@/lib/services/profile.service';
import { ANON_MESSAGE_CAP, checkAndIncrementUsage, getSessionId } from '@/lib/services/session.service';

/**
 * Controller for the chat endpoint: parse the request, work out who is asking,
 * gate anonymous traffic, and shape the streaming response. The turn itself --
 * persistence, the reply, corrections, glosses, vocab -- lives in
 * lib/services/chat.service.ts.
 */
export async function POST(req: Request) {
  const {
    messages,
    conversationId,
  }: { messages: LangTutorUIMessage[]; conversationId?: string | null } = await req.json();

  const userId = await getCurrentUserId();

  // Rate limit check happens before anything else -- specifically before any
  // Groq call -- so a capped-out anonymous visitor costs us zero tokens, not
  // just zero *visible* reply. Signed-in users skip this entirely; the cap
  // only exists to protect against unauthenticated traffic.
  if (!userId) {
    const sessionId = await getSessionId();
    const { allowed } = await checkAndIncrementUsage(sessionId);

    if (!allowed) {
      const stream = createUIMessageStream<LangTutorUIMessage>({
        execute: async ({ writer }) => {
          writer.write({
            type: 'data-rateLimited',
            id: 'rate-limit-1',
            data: { cap: ANON_MESSAGE_CAP },
          });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
  }

  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(userId, levelCookie);

  const turn = await startChatTurn({ userId, level, messages, conversationId });

  const stream = createUIMessageStream<LangTutorUIMessage>({
    // Returned, not fired-and-forgotten: the response stays open until this
    // promise settles, which is how the service's late writes (correction,
    // gloss, vocab) make it to the client at all.
    execute: ({ writer }) => runChatTurn(turn, writer),
  });

  return createUIMessageStreamResponse({ stream });
}
