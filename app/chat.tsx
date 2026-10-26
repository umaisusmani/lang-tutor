'use client';

import { useChat } from '@ai-sdk/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import {
  ChatComposer,
  ChatThread,
  ChatWelcome,
  type ExplanationRequest,
} from '@/app/components/chat/chat-content';
import { ChatSidePanel } from '@/app/components/chat/side-panel';
import { useConfirm } from '@/app/components/confirm-modal';
import { SiteHeader } from '@/app/components/site-header';
import { notifyError } from '@/app/components/toaster';
import { QuotaBanner } from '@/app/components/quota-banner';
import { useQuota } from '@/app/hooks/use-quota';
import type { QuotaStatus } from '@/lib/quota';
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
  initialQuota,
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
  initialQuota: QuotaStatus;
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
  const router = useRouter();
  const confirm = useConfirm();
  const { theme, toggleTheme } = useTheme();
  const { quota, accept: acceptQuota, refresh: refreshQuota } = useQuota(initialQuota);
  const remaining = quota.remaining;
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  // Set right before opening the panel, so a specific entry point (the "out
  // of messages" card's Translate button) can land on that tab instead of
  // the default "ask" view. Left alone otherwise, so the panel keeps
  // whichever tab the learner was already on.
  const [toolsView, setToolsView] = useState<'ask' | 'words' | 'translate' | undefined>();
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
    onError: () => {
      notifyError("Couldn't reach the tutor. Please try again.", 'chat');
      void refreshQuota();
    },
    onFinish: () => { void refreshQuota(); },
    // Background steps (correction, gloss, history) report failures as
    // transient `notice` parts. They arrive here once and never enter
    // message.parts, so there's nothing to dedupe against on re-render.
    onData: (part) => {
      if (part.type === 'data-quota') acceptQuota(part.data);
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
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';
  const capped = quota.reason !== null || remaining <= 0;
  // The narrower case the takeover card answers to: the learner's own daily
  // cap, not a shared-limit or allowance-check failure, which keep the
  // smaller banner and a still-visible (if disabled) composer.
  const cappedByUser = quota.reason === 'user' || (quota.reason === null && remaining <= 0);
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
        notifyError("Couldn't explain this one. Please try again.", `explain-${key}`);
        return;
      }

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

  }

  async function promptToolsSignUp() {
    const signUp = await confirm({
      title: 'Learning tools',
      description: 'Create an account to ask questions, translate, and save words.',
      confirmLabel: 'Create account',
      cancelLabel: 'Not now',
    });
    if (signUp) router.push('/login?mode=signup');
  }

  function openLearningPanel(view?: 'ask' | 'words' | 'translate') {
    if (userEmail === null) {
      void promptToolsSignUp();
      return;
    }
    setToolsView(view);
    setSidePanelOpen(true);
  }

  return (
    // The header sits outside the 860px column, on its own 1080px track (see
    // SiteHeader) -- wider chrome, same readable line length for replies.
    <div className="bg-paper text-ink flex h-dvh min-h-[400px] flex-col items-center overflow-hidden px-[18px]">
      <SiteHeader
        level={level}
        onLevelChange={handleLevelChange}
        userEmail={userEmail}
        userName={userName}
        conversations={conversations}
        conversationId={conversationId.current}
        remaining={remaining}
        messageCap={messageCap}
        persona={persona}
        theme={theme}
        onThemeToggle={toggleTheme}
        activePage="chat"
        dueCount={dueCount}
      />

      <div className="relative flex min-h-0 w-full max-w-[1240px] flex-1 justify-center">
          <button
            type="button"
            aria-label="Open learning tools"
            aria-controls="chat-side-panel"
            aria-expanded={sidePanelOpen}
            onClick={() => openLearningPanel()}
            className={`${sidePanelOpen ? 'invisible' : ''} border-line bg-paper text-ink fixed top-1/2 right-0 z-20 flex h-12 -translate-y-1/2 items-center gap-1.5 rounded-l-xl border-2 border-r-0 py-2 pr-1 pl-2 font-mono text-[11px] shadow-[-2px_2px_0_var(--line)] transition-colors hover:bg-yellow hover:text-on-bright`}
          >
            <span>Tools</span><span aria-hidden="true" className="text-base leading-none">‹</span>
          </button>
        <div className="flex min-h-0 min-w-0 max-w-[860px] flex-1 flex-col">
          <div className="chat-scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {messages.length === 0 ? (
            <ChatWelcome
              level={level}
              remaining={remaining}
              signedIn={userEmail !== null}
              starters={starters}
              disabled={capped || busy}
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
          </div>

          <ChatComposer
            input={input}
            busy={busy}
            capped={capped}
            hideInput={cappedByUser}
            quotaNotice={
              <QuotaBanner
                quota={quota}
                signedIn={userEmail !== null}
                onRetry={() => void refreshQuota()}
                persona={persona}
                dueCount={dueCount}
                onOpenTranslate={() => openLearningPanel('translate')}
              />
            }
            onInputChange={setInput}
            onSend={send}
          />
        </div>

        <ChatSidePanel
          open={sidePanelOpen}
          openOnView={toolsView}
          messages={messages}
          level={level}
          remaining={remaining}
          canSave={canSave}
          isSaved={isSaved}
          onSaveWord={saveWord}
          quota={quota}
          onQuotaChange={acceptQuota}
          onQuotaRefresh={refreshQuota}
          onAuthRequired={() => {
            setSidePanelOpen(false);
            void promptToolsSignUp();
          }}
          onClose={() => setSidePanelOpen(false)}
        />
      </div>
    </div>
  );
}
