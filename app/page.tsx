import { cookies } from 'next/headers';

import Chat from '@/app/chat';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import { STARTERS, STARTERS_SHOWN, type Starter } from '@/lib/constants';
import {
  getConversation,
  getLatestConversation,
  getMessages,
  listConversations,
} from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { ANON_MESSAGE_CAP, getRemainingMessages } from '@/lib/services/session.service';
import { getSavedLemmas } from '@/lib/services/vocab.service';
import type { Conversation, Message } from '@/lib/types/db';

/**
 * Rebuilds stored rows into the shape useChat renders.
 *
 * The pairing here is the reason corrections are stored on the USER row: a
 * correction describes what the learner wrote, but the UI draws it under the
 * reply that followed, so each assistant message picks up the correction
 * belonging to the message before it.
 *
 * Synchronous and database-free, which it wasn't before: it used to run a
 * getVocabCandidates() query per assistant message to build the save chips,
 * so restoring a 40-message thread meant 20 sequential round-trips inside
 * this loop. The saved-lemma lookup those chips needed now happens once for
 * the whole thread, in Page below.
 */
function toUIMessages(stored: Message[]): LangTutorUIMessage[] {
  const byId = new Map<string, LangTutorUIMessage>();

  for (const [i, m] of stored.entries()) {
    const parts: LangTutorUIMessage['parts'] = [{ type: 'text', text: m.content }];

    if (m.role === 'assistant') {
      if (m.gloss) {
        parts.push({ type: 'data-gloss', id: `${m.id}-gloss`, data: m.gloss });
      }

      const previous = stored[i - 1];
      if (previous?.role === 'user' && previous.correction) {
        parts.push({
          type: 'data-correction',
          id: `${m.id}-correction`,
          data: previous.correction,
        });
      }
    }

    byId.set(m.id, { id: m.id, role: m.role, parts });
  }

  return stored.map((m) => byId.get(m.id)!);
}

/**
 * `count` distinct starters drawn at random from the pool.
 *
 * Runs here, on the server, and the result is handed to <Chat> as a prop --
 * not picked inside the client component. Chat is server-rendered first and
 * then hydrated, so a Math.random() in its render would produce one set of
 * starters in the HTML and a different set on hydration: a mismatch React
 * warns about and patches over with a visible flicker. Picking once, upstream,
 * gives both passes the same three. This page is already dynamic (it reads
 * cookies), so it re-picks on every visit, including each "+ new chat".
 *
 * A partial Fisher-Yates shuffle: only the first `count` slots get settled,
 * and each is swapped with a random later one, so every item is equally
 * likely and none repeats -- which sorting by Math.random() would not
 * guarantee.
 */
function pickStarters(count: number): Starter[] {
  const pool = [...STARTERS];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * Every lemma the restored thread can offer a save button for: the reply
 * glosses and the corrections' glosses both, since the panel renders the same
 * way under either. Gathered from the built parts rather than the raw rows so
 * there's one definition of "what's saveable" and it's the one the UI uses.
 *
 * Glosses stored before `lemma` joined the schema have none (it's jsonb --
 * nothing enforces the type at read time), hence the filter.
 */
function glossedLemmas(messages: LangTutorUIMessage[]): string[] {
  return messages.flatMap((m) =>
    m.parts.flatMap((p) => {
      if (p.type === 'data-gloss') return p.data.map((g) => g.lemma).filter(Boolean);
      if (p.type === 'data-correction') {
        return (p.data.correctionGloss ?? []).map((g) => g.lemma).filter(Boolean);
      }
      return [];
    }),
  );
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
  let initialSavedLemmas: string[] = [];

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

      if (conversation) {
        initialMessages = toUIMessages(await getMessages(conversation.id));
        // One query for the whole thread, however long it is.
        initialSavedLemmas = await getSavedLemmas(user.id, glossedLemmas(initialMessages));
      }
    }
  }

  // Display only, never used for authorization: user_metadata is editable by
  // the user themselves. Google sign-ins carry a real name; email/password
  // accounts fall back to the part of the address before the @. First name
  // only, to keep the header compact.
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    null;
  const userName = fullName ? fullName.trim().split(/\s+/)[0] : null;

  return (
    // Keyed by conversation so switching chats remounts the client component.
    // Without it, navigating /?c=A -> /?c=B re-renders this page with new props
    // (a 200 in the network tab) but the mounted <Chat> keeps its old state:
    // useChat only treats `messages` as an initial seed, and only rebuilds
    // itself when its `id` option changes. The key resets messages, the
    // conversation-id ref and every other per-chat piece of UI state at once.
    <Chat
      key={conversation?.id ?? 'new'}
      initialLevel={level}
      userEmail={user?.email ?? null}
      userName={userName}
      initialRemaining={remaining}
      messageCap={ANON_MESSAGE_CAP}
      initialMessages={initialMessages}
      initialSavedLemmas={initialSavedLemmas}
      starters={pickStarters(STARTERS_SHOWN)}
      initialConversationId={conversation?.id ?? null}
      conversations={conversations}
    />
  );
}
