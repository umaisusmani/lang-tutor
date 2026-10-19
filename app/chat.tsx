'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import {
  ChatComposer,
  ChatThread,
  ChatWelcome,
  type ExplanationRequest,
  limitMessage,
} from '@/app/components/chat/chat-content';
import { SiteHeader } from '@/app/components/site-header';
import { notifyError } from '@/app/components/toaster';
import { useTheme } from '@/app/hooks/use-theme';
import { saveVocabAction } from '@/app/vocab/actions';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { Starter } from '@/lib/constants';
import type { WordGloss } from '@/lib/gloss';
import type { PersonaProfile } from '@/lib/personas';
import type { CefrLevel } from '@/lib/prompts';
import { sentenceContaining } from '@/lib/text';
import type { Conversation, VocabSource } from '@/lib/types/db';

const LEVEL_COOKIE = 'cefr_level';

function writeLevelCookie(level: CefrLevel) {
  document.cookie = `${LEVEL_COOKIE}=${level}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function Chat({
  initialLevel,
  userEmail,
  userName,
  initialRemaining,
  messageCap,
  dueCount,
  initialMessages,
  initialSavedLemmas,
  starters,
  initialConversationId,
  conversations,
  persona,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
  userName: string | null;
  initialRemaining: number | null;
  messageCap: number;
  dueCount: number;
  initialMessages: LangTutorUIMessage[];
  initialSavedLemmas: string[];
  starters: Starter[];
  initialConversationId: string | null;
  conversations: Conversation[];
  persona: PersonaProfile;
}) {
  const [input, setInput] = useState('');
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const { theme, toggleTheme } = useTheme();
  const [remaining, setRemaining] = useState(initialRemaining);
  // Which translation panels are open, keyed `${message.id}-reply` / `-corr`.
  const [openPanel, setOpenPanel] = useState<Record<string, boolean>>({});
  // Grammar explanations fetched this session (same keys), and which are
  // still streaming in. Ones stored before the page loaded arrive as
  // `explanations` parts instead -- see explanationFor() below.
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explaining, setExplaining] = useState<Record<string, boolean>>({});
  // Words the learner ticked during this session -- the only part of "is this
  // saved" that's genuinely local state. Everything else is derived below.
  const [locallySaved, setLocallySaved] = useState<ReadonlySet<string>>(() => new Set<string>());
  const conversationId = useRef(initialConversationId);
  const { messages, sendMessage, status, error } = useChat<LangTutorUIMessage>({
    messages: initialMessages,
    // The whole request failed (model down, rate-limited upstream, a 500 from
    // startChatTurn). The inline message under the thread stays -- a reply
    // that never arrived should leave a mark in the conversation -- and this
    // adds the transient heads-up for a learner not looking at the bottom.
    onError: () => notifyError("Couldn't reach the tutor. Please try again.", 'chat'),
    // Background steps (correction, gloss, history) report failures as
    // transient `notice` parts. They arrive here once and never enter
    // message.parts, so there's nothing to dedupe against on re-render.
    onData: (part) => {
      if (part.type === 'data-notice') notifyError(part.data.message, part.data.source);
    },
  });

  useEffect(() => {
    const id = messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'data-conversation')?.data.id;
    if (id) conversationId.current = id;
  }, [messages]);

  /**
   * Which lemmas show a ✓, as one Set for the whole thread rather than
   * per-message state: a lemma is global to the learner, not to the message
   * it appeared in, so saving "Kind" in one reply has to tick it everywhere
   * else it shows up -- twice in the same gloss, or again in a correction.
   *
   * Derived every render from its three sources (what the server knew at page
   * load, what the stream has reported since, and what the learner has
   * clicked) instead of folding the streamed parts into state in an effect.
   * That ordering is the point: the union can't disagree with itself, and a
   * saved-lemma part computed before a click can't land afterwards and
   * un-tick the word under the learner's cursor.
   *
   * Lowercased throughout -- `lemma` comes from the model, so its casing is
   * only as steady as the model's, and a ✓ that depends on that flickers.
   */
  const savedLemmas = useMemo(() => {
    const set = new Set(initialSavedLemmas.map((l) => l.toLowerCase()));
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'data-savedLemmas') for (const l of p.data) set.add(l.toLowerCase());
      }
    }
    for (const l of locallySaved) set.add(l);
    return set;
  }, [initialSavedLemmas, messages, locallySaved]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';
  const capped = remaining !== null && remaining <= 0;
  // Anonymous visitors have no vocab_entries to save into, so their gloss
  // panels stay exactly as they were: words and translations, no buttons.
  const canSave = userEmail !== null;
  const isSaved = (lemma: string) => savedLemmas.has(lemma.toLowerCase());

  function handleLevelChange(next: CefrLevel) {
    setLevel(next);
    writeLevelCookie(next);
    if (userEmail) void saveLevel(next);
  }

  /**
   * Optimistic: the word ticks the instant it's clicked, then is undone if the
   * save turns out not to have happened.
   *
   * This used to skip the rollback on purpose -- a lost save was invisible
   * either way, and un-ticking a word under the cursor for no stated reason
   * seemed the worse lie. Now that a failure is reported (the action returns
   * `ok`, and the toast says why the tick vanished) the trade flips: leaving a
   * ✓ on a word that will be gone on reload is the lie, and it's the one that
   * costs the learner a word they thought they'd kept.
   *
   * The guard matters more than it looks: Server Actions dispatch one at a
   * time per client, so clicking + down a long gloss queues them. Skipping
   * lemmas already in the Set keeps a double-click off that queue entirely.
   */
  async function saveWord(entry: WordGloss[number], source: VocabSource, sourceText: string) {
    const key = entry.lemma.toLowerCase();
    if (!userEmail || !entry.lemma || savedLemmas.has(key)) return;

    setLocallySaved((prev) => new Set(prev).add(key));

    // A rejected promise (network drop, timeout) is a failed save just like
    // `ok: false`, so both funnel into the same undo.
    let ok = false;
    try {
      ({ ok } = await saveVocabAction(
        {
          term: entry.word,
          lemma: entry.lemma,
          // The lemma's own meaning, not the word's meaning in this sentence
          // (see WordGlossSchema). Glosses stored before lemmaTranslation
          // existed don't have it, hence the fallback.
          translation: entry.lemmaTranslation || entry.translation,
          exampleSentence: sentenceContaining(sourceText, entry.word),
        },
        source,
      ));
    } catch {
      // ok stays false
    }

    if (!ok) {
      setLocallySaved((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      notifyError(`Couldn't save "${entry.lemma}". Please try again.`, `save-${key}`);
    }
  }

  /**
   * Streams a grammar explanation into the panel. With a database id the
   * server reads the text from that row and saves the answer onto it (or
   * returns the one already saved); without one -- anonymous, or a turn whose
   * rows didn't save -- it explains the text sent here and keeps nothing.
   *
   * On failure the partial text is dropped rather than left half-written, and
   * the button comes back so the learner can try again.
   */
  async function explain(
    key: string,
    request: ExplanationRequest,
  ) {
    if (explaining[key]) return;
    setExplaining((s) => ({ ...s, [key]: true }));

    const drop = () =>
      setExplanations((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, level }),
      });

      if (!res.ok || !res.body) {
        let message = "Couldn't explain this one. Please try again.";
        if (res.status === 429) {
          const body = await res.json().catch(() => null);
          message = limitMessage(body?.reason, body?.signedIn === true);
          setRemaining(0);
        }
        notifyError(message, `explain-${key}`);
        return;
      }

      // A fresh explanation spends a message server-side; a cached one doesn't.
      // The server says where the allowance stands either way.
      const left = Number(res.headers.get('X-Messages-Remaining'));
      if (res.headers.has('X-Messages-Remaining') && Number.isFinite(left)) setRemaining(left);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setExplanations((s) => ({ ...s, [key]: text }));
      }
      if (!text.trim()) {
        drop();
        notifyError("Couldn't explain this one. Please try again.", `explain-${key}`);
      }
    } catch {
      drop();
      notifyError("Couldn't explain this one. Please try again.", `explain-${key}`);
    } finally {
      setExplaining((s) => ({ ...s, [key]: false }));
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || capped) return;
    // `level` rides along so the reply uses the level on screen, not whatever
    // the profile holds -- see the route for the race this closes.
    sendMessage({ text: trimmed }, { body: { conversationId: conversationId.current, level } });
    setInput('');
    setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));
  }

  return (
    // The header sits outside the 860px column, on its own 1080px track (see
    // SiteHeader) -- wider chrome, same readable line length for replies.
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <SiteHeader
        level={level}
        onLevelChange={handleLevelChange}
        userEmail={userEmail}
        userName={userName}
        conversations={conversations}
        conversationId={conversationId.current}
        remaining={remaining}
        messageCap={messageCap}
        theme={theme}
        onThemeToggle={toggleTheme}
        activePage="chat"
        dueCount={dueCount}
      />

      <div className="flex w-full max-w-[860px] flex-1 flex-col">
        {messages.length === 0 ? (
          <ChatWelcome
            level={level}
            remaining={remaining}
            messageCap={messageCap}
            signedIn={userEmail !== null}
            starters={starters}
            persona={persona}
            onSend={send}
          />
        ) : (
          <ChatThread
            messages={messages}
            status={status}
            error={error}
            persona={persona}
            openPanels={openPanel}
            explanations={explanations}
            explaining={explaining}
            canSave={canSave}
            isSaved={isSaved}
            onTogglePanel={(key) =>
              setOpenPanel((current) => ({ ...current, [key]: !current[key] }))
            }
            onSaveWord={saveWord}
            onExplain={explain}
          />
        )}

        <div ref={bottomRef} />

        <ChatComposer
          input={input}
          busy={busy}
          capped={capped}
          signedIn={userEmail !== null}
          onInputChange={setInput}
          onSend={send}
        />
      </div>
    </div>
  );
}
