'use client';

import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import { GlossedText } from '@/app/components/glossed-text';
import { PersonaAvatar } from '@/app/components/persona-avatar';
import { SiteHeader } from '@/app/components/site-header';
import { notifyError } from '@/app/components/toaster';
import { TranslateButton, TranslationPanel } from '@/app/components/translation-panel';
// DEPRECATED: import { VocabChips } from '@/app/components/vocab-chips';
import { saveVocabAction } from '@/app/vocab/actions';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { Starter } from '@/lib/constants';
import { hasCorrectionCard } from '@/lib/correction-card';
import type { ExplainKind } from '@/lib/explain';
import type { WordGloss } from '@/lib/gloss';
import { MISTAKE_TYPES } from '@/lib/mistake-types';
import type { PersonaProfile } from '@/lib/personas';
import type { CefrLevel } from '@/lib/prompts';
import { changedWordIndices, sentenceContaining } from '@/lib/text';
import type { Conversation, VocabSource } from '@/lib/types/db';

const MISTAKE_TYPE_LABELS: Record<(typeof MISTAKE_TYPES)[number], string> = {
  word_order: 'word order',
  case_declension: 'case',
  gender_article: 'gender / article',
  verb_conjugation: 'verb conjugation',
  auxiliary_verb: 'auxiliary verb',
  preposition: 'preposition',
  adjective_ending: 'adjective ending',
  plural_form: 'plural form',
  word_choice: 'word choice',
  other: 'grammar',
};

const LEVEL_COOKIE = 'cefr_level';
const THEME_KEY = 'starfinch_theme';
/** Pre-rename key, still read so a theme chosen before the rename survives it. */
const LEGACY_THEME_KEY = 'starprache_theme';

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
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
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
    try {
      const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // Private mode or blocked storage -- stay on the system preference.
    }
  }, []);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';
  const capped = remaining !== null && remaining <= 0;
  // Anonymous visitors have no vocab_entries to save into, so their gloss
  // panels stay exactly as they were: words and translations, no buttons.
  const canSave = userEmail !== null;
  const isSaved = (lemma: string) => savedLemmas.has(lemma.toLowerCase());

  function toggleTheme() {
    const next =
      theme === 'dark'
        ? 'light'
        : theme === 'light'
          ? 'dark'
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'light'
            : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not persisting is survivable; the toggle still works for this session.
    }
  }

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
    request: { kind: ExplainKind; messageId: string | null; text: string; original?: string },
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
        notifyError(
          res.status === 429
            ? "You've used your free messages. Sign in to keep going."
            : "Couldn't explain this one. Please try again.",
          `explain-${key}`,
        );
        return;
      }

      // Anonymous explanations spend a free message server-side; mirror it.
      setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));

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
          <main className="flex flex-1 flex-col justify-center gap-[26px] py-10">
            <div className="flex flex-col gap-2.5">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.12em] uppercase">
                level {level}
                {remaining !== null && ` · ${remaining} free messages`}
              </span>
              <div className="flex items-center gap-3">
                <PersonaAvatar persona={persona} size={48} />
                <div className="flex flex-col">
                  <span className="text-[17px] font-bold">{persona.name}</span>
                  <span className="text-ink-3 font-mono text-[11px]">
                    {[persona.age, persona.city].filter((v) => v != null).join(' · ')}
                  </span>
                </div>
              </div>
              <h1 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.025em]">
                Sag einfach etwas.
              </h1>
              <p className="text-ink-2 max-w-[52ch] text-base leading-relaxed">
                Chat with {persona.name} in German, however rough. Don&apos;t know a word? Just
                write it in English and you&apos;ll see how to say it in German. Every reply comes
                with a translation, and a correction when something&apos;s off.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
                or start with
              </span>
              {starters.map(([de, en]) => (
                <button
                  key={de}
                  type="button"
                  onClick={() => send(de)}
                  className="border-line bg-panel hover:shadow-[3px_3px_0_var(--line)] flex cursor-pointer flex-col gap-[3px] rounded-[14px] border-2 px-4 py-3.5 text-left transition-transform hover:-translate-x-px hover:-translate-y-px"
                >
                  <span className="text-ink text-[17px]">{de}</span>
                  <span className="text-ink-3 font-mono text-[11px]">{en}</span>
                </button>
              ))}
            </div>

            {remaining !== null && (
              <div className="text-ink-3 flex items-center gap-2 font-mono text-[11px]">
                <span className="bg-yellow text-on-bright rounded-[5px] px-[7px] py-0.5 font-medium">
                  {messageCap} free
                </span>
                <span>messages before signing in</span>
              </div>
            )}
          </main>
        ) : (
          <main className="flex flex-1 flex-col gap-[34px] pt-[22px] pb-7">
            {messages.map((message, msgIndex) => {
              const replyGloss = message.parts.find((p) => p.type === 'data-gloss')?.data;
              // DEPRECATED -- the save chips this fed are gone; words are now
              // saved from the word menus. See vocab-chips.tsx.
              // const vocabCandidates = message.parts.find(
              //   (p) => p.type === 'data-vocabCandidates',
              // )?.data;
              const rateLimited = message.parts.find((p) => p.type === 'data-rateLimited')?.data;
              const correctionPart = message.parts.find(
                (p): p is Extract<typeof p, { type: 'data-correction' }> =>
                  p.type === 'data-correction',
              );
              const correction =
                correctionPart && hasCorrectionCard(correctionPart.data)
                  ? correctionPart.data
                  : undefined;
              const dbIds = message.parts.find((p) => p.type === 'data-messageIds')?.data;
              const storedExplanations = message.parts.find(
                (p) => p.type === 'data-explanations',
              )?.data;

              const text = message.parts
                .filter((p) => p.type === 'text')
                .map((p) => p.text)
                .join('\n');

              if (rateLimited) {
                return (
                  <div
                    key={message.id}
                    className="border-line bg-yellow text-on-bright flex flex-col items-start gap-2 rounded-[18px] border-2 p-6 shadow-[4px_4px_0_var(--line)]"
                  >
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                      {rateLimited.cap} of {rateLimited.cap} messages
                    </span>
                    <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">
                      Das war&apos;s für heute.
                    </h2>
                    <p className="max-w-[46ch] text-[15px] leading-[1.55]">
                      You&apos;ve used your {rateLimited.cap} free messages. Sign in to keep the
                      conversation going and save your progress.
                    </p>
                    <Link
                      href="/login"
                      className="bg-ink text-paper mt-2 rounded-full px-5 py-2.5 text-[15px] font-bold no-underline transition-transform hover:translate-x-px hover:translate-y-px"
                    >
                      Sign in →
                    </Link>
                  </div>
                );
              }

              if (message.role === 'user') {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="border-line bg-accent text-on-accent max-w-[82%] rounded-[18px_18px_5px_18px] border-2 px-4 py-[11px] text-[17px] leading-[1.45] whitespace-pre-wrap shadow-[3px_3px_0_var(--line)]">
                      {text}
                    </div>
                  </div>
                );
              }

              const priorUserText =
                msgIndex > 0
                  ? messages[msgIndex - 1].parts
                      .filter((p) => p.type === 'text')
                      .map((p) => p.text)
                      .join(' ')
                  : '';

              const replyKey = `${message.id}-reply`;
              const corrKey = `${message.id}-corr`;
              const replyOpen = openPanel[replyKey] ?? false;
              const corrOpen = openPanel[corrKey] ?? false;
              // `busy` stays true after the reply text finishes: the response
              // is held open until the gloss and correction have been written,
              // so this also means "its attachments may still be coming".
              const inFlight = busy && msgIndex === messages.length - 1;
              // The reply text itself still arriving -- narrower than inFlight.
              const textStreaming = message.parts.some(
                (p) => p.type === 'text' && p.state === 'streaming',
              );

              // The correction check's state, made visible either way so a
              // missing card can't be mistaken for "no mistake" (QA's
              // "correction came missing" report): pending while in flight,
              // then a card or "✓ no corrections". A failed check writes no
              // part and toasts instead.
              const checking = inFlight && !correctionPart && priorUserText.trim() !== '';
              const checkedClean =
                !!correctionPart &&
                !correctionPart.data.hasMistake &&
                !correctionPart.data.usedEnglish;

              return (
                <div key={message.id} className="flex max-w-[92%] items-start gap-3">
                  <PersonaAvatar persona={persona} size={32} className="mt-[3px]" />

                  <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 text-[19px] leading-[1.6]">
                          <GlossedText
                            text={text}
                            words={replyGloss?.words}
                            canSave={canSave}
                            isSaved={isSaved}
                            onSave={(entry) => saveWord(entry, 'new_word', text)}
                          />
                          {textStreaming && (
                            <span className="bg-accent ml-[3px] inline-block h-[18px] w-[9px] animate-[blink_1s_step-end_infinite] align-[-3px]" />
                          )}
                        </div>
                        {replyGloss ? (
                          <TranslateButton
                            open={replyOpen}
                            onToggle={() => setOpenPanel((s) => ({ ...s, [replyKey]: !replyOpen }))}
                            className="mt-[5px]"
                          />
                        ) : (
                          inFlight && (
                            <TranslateButton
                              open={false}
                              pending
                              onToggle={() => {}}
                              className="mt-[5px]"
                            />
                          )
                        )}
                      </div>

                      {replyGloss && (
                        <TranslationPanel
                          open={replyOpen}
                          translation={replyGloss.translation}
                          explanation={explanations[replyKey] ?? storedExplanations?.reply ?? undefined}
                          explaining={explaining[replyKey] ?? false}
                          onExplain={() =>
                            explain(replyKey, {
                              kind: 'reply',
                              messageId: dbIds?.assistant ?? null,
                              text,
                            })
                          }
                        />
                      )}
                    </div>

                    {checking && (
                      <span className="text-ink-3 animate-[fade-rise_240ms_ease-out] font-mono text-[10px] tracking-[0.06em]">
                        checking your German…
                      </span>
                    )}
                    {checkedClean && (
                      <span className="text-ink-3 animate-[fade-rise_240ms_ease-out] font-mono text-[10px] tracking-[0.06em]">
                        ✓ no corrections
                      </span>
                    )}

                    {correction && correction.correction && (
                      <div className="border-line bg-panel relative animate-[fade-rise_240ms_ease-out] rounded-[14px] border-2 px-4 pt-[18px] pb-3.5 shadow-[3px_3px_0_var(--line)]">
                        {/* A mistake gets its type; English-only gets "in
                            German" in yellow, so it doesn't read as an error --
                            using English was invited. */}
                        <span
                          className={`border-line text-on-bright absolute -top-[11px] left-3.5 rounded-md border-2 px-2 py-px font-mono text-[10px] tracking-[0.08em] uppercase ${
                            correction.hasMistake ? 'bg-orange' : 'bg-yellow'
                          }`}
                        >
                          {correction.hasMistake
                            ? correction.mistakeType
                              ? MISTAKE_TYPE_LABELS[correction.mistakeType]
                              : 'grammar'
                            : 'in German'}
                        </span>

                        <div className="flex items-start gap-3">
                          {/* 'mistake', not 'new_word': a word met in a
                              correction is one the learner got wrong (or
                              didn't know), and /vocab can treat those
                              differently. */}
                          <GlossedText
                            className="flex-1 text-[18px] leading-[1.6]"
                            text={correction.correction}
                            words={correction.correctionGloss ?? undefined}
                            highlight={changedWordIndices(priorUserText, correction.correction)}
                            canSave={canSave}
                            isSaved={isSaved}
                            onSave={(entry) =>
                              saveWord(entry, 'mistake', correction.correction ?? '')
                            }
                          />
                          <TranslateButton
                            open={corrOpen}
                            onToggle={() => setOpenPanel((s) => ({ ...s, [corrKey]: !corrOpen }))}
                            className="mt-[3px]"
                          />
                        </div>

                        <div className="mt-3">
                          <TranslationPanel
                            open={corrOpen}
                            translation={correction.correctionTranslation ?? null}
                            explanation={
                              explanations[corrKey] ?? storedExplanations?.correction ?? undefined
                            }
                            explaining={explaining[corrKey] ?? false}
                            onExplain={() =>
                              explain(corrKey, {
                                kind: 'correction',
                                messageId: dbIds?.user ?? null,
                                text: correction.correction ?? '',
                                original: priorUserText,
                              })
                            }
                          />
                        </div>

                        <p className="text-ink-2 mt-3 font-mono text-[12.5px] leading-[1.6]">
                          {correction.explanation}
                        </p>
                      </div>
                    )}

                    {/* DEPRECATED: {vocabCandidates && <VocabChips candidates={vocabCandidates} />} */}
                  </div>
                </div>
              );
            })}

            {status === 'submitted' && (
              <div className="flex max-w-[92%] items-start gap-3">
                <PersonaAvatar persona={persona} size={32} className="mt-[3px]" />
                <div className="text-[19px] leading-[1.6]">
                  <span className="bg-accent inline-block h-[18px] w-[9px] animate-[blink_1s_step-end_infinite] align-[-3px]" />
                </div>
              </div>
            )}

            {error && (
              <p className="font-mono text-[12.5px] text-red-600 dark:text-red-400">
                Etwas ist schiefgelaufen. Bitte versuch es noch einmal.
              </p>
            )}
          </main>
        )}

        <div ref={bottomRef} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="bg-paper sticky bottom-0 flex flex-col gap-3 pt-3 pb-6"
        >
          <div className="bg-line h-0.5 opacity-50" />
          <div className="flex items-center gap-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              disabled={capped}
              placeholder={
                capped ? 'Sign in to keep going' : 'Schreib auf Deutsch… English words are fine too'
              }
              className="border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] min-w-0 flex-1 rounded-full border-2 px-[18px] py-3 text-base outline-none transition-shadow duration-150 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || capped || !input.trim()}
              className="border-line bg-ink text-paper hover:bg-accent hover:text-on-accent flex-none cursor-pointer rounded-full border-2 px-[22px] py-3 text-[15px] font-bold transition-colors duration-150 active:translate-x-px active:translate-y-px disabled:opacity-40"
            >
              Senden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
