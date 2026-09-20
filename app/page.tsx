import { cookies } from 'next/headers';

import Chat from '@/app/chat';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import {
  getConversation,
  getLatestConversation,
  getMessages,
  listConversations,
} from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { ANON_MESSAGE_CAP, getRemainingMessages } from '@/lib/services/session.service';
import type { Conversation, Message } from '@/lib/types/db';

/**
 * Rebuilds stored rows into the shape useChat renders.
 *
 * The pairing here is the reason corrections are stored on the USER row: a
 * correction describes what the learner wrote, but the UI draws it under the
 * reply that followed, so each assistant message picks up the correction
 * belonging to the message before it.
 */
function toUIMessages(stored: Message[]): LangTutorUIMessage[] {
  return stored.map((m, i) => {
    const parts: LangTutorUIMessage['parts'] = [{ type: 'text', text: m.content }];

    if (m.role === 'assistant') {
      if (m.gloss) parts.push({ type: 'data-gloss', id: `${m.id}-gloss`, data: m.gloss });

      const previous = stored[i - 1];
      if (previous?.role === 'user' && previous.correction) {
        parts.push({
          type: 'data-correction',
          id: `${m.id}-correction`,
          data: previous.correction,
        });
      }
    }

    return { id: m.id, role: m.role, parts };
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getCurrentUser();
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user?.id ?? null, levelCookie);

  // Only anonymous visitors have an allowance to show -- signed-in users are
  // uncapped, so the header's progress row is hidden for them entirely.
  const remaining = user ? null : await getRemainingMessages();

  // History is a signed-in feature: anonymous turns are never persisted, so
  // there is nothing to restore for them.
  let conversations: Conversation[] = [];
  let conversation: Conversation | null = null;
  let initialMessages: LangTutorUIMessage[] = [];

  if (user) {
    const requested = (await searchParams).c;
    conversations = await listConversations(user.id);

    // ?c=new opens an empty thread without creating a row -- the conversation
    // is created by the route when the first message actually arrives, so
    // abandoning a new chat leaves nothing behind.
    if (requested !== 'new') {
      conversation = requested
        ? await getConversation(requested)
        : await getLatestConversation(user.id);

      if (conversation) initialMessages = toUIMessages(await getMessages(conversation.id));
    }
  }

  return (
    <Chat
      initialLevel={level}
      userEmail={user?.email ?? null}
      initialRemaining={remaining}
      messageCap={ANON_MESSAGE_CAP}
      initialMessages={initialMessages}
      initialConversationId={conversation?.id ?? null}
      conversations={conversations}
    />
  );
}
