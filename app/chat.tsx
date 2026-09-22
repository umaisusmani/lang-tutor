'use client';

import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import { SiteHeader } from '@/app/components/site-header';
import { notifyError } from '@/app/components/toaster';
// DEPRECATED: import { VocabChips } from '@/app/components/vocab-chips';
import { saveVocabAction } from '@/app/vocab/actions';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { Starter } from '@/lib/constants';
import type { WordGloss } from '@/lib/gloss';
import { MISTAKE_TYPES } from '@/lib/mistake-types';
import type { CefrLevel } from '@/lib/prompts';
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
const THEME_KEY = 'starprache_theme';

function writeLevelCookie(level: CefrLevel) {
  document.cookie = `${LEVEL_COOKIE}=${level}; path=/; max-age=31536000; SameSite=Lax`;
}

/** Strips leading/trailing punctuation so a gloss entry still matches a word
 * that carries a comma or full stop in the sentence. */
function stripPunctuation(word: string): string {
  return word.replace(/^[^\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]+$/g, '');
}

/**
 * Which words in the corrected sentence weren't in what the learner wrote --
 * those get the orange highlight.
 *
 * Deliberately a local diff rather than something the model returns: the
 * correction call already gives us both strings, so asking it to also mark the
 * changed word would be a wider schema (and another thing it can get wrong)
 * for information we can derive exactly. Consuming matches from a multiset
 * means a word the learner used once but the correction uses twice still
 * highlights the second one.
 */
function changedWordIndices(original: string, corrected: string): Set<number> {
  const pool = new Map<string, number>();
  for (const token of original.split(/\s+/)) {
    const key = stripPunctuation(token).toLowerCase();
    if (key) pool.set(key, (pool.get(key) ?? 0) + 1);
  }

  const changed = new Set<number>();
  corrected.split(/\s+/).forEach((token, i) => {
    const key = stripPunctuation(token).toLowerCase();
    if (!key) return;
    const left = pool.get(key) ?? 0;
    if (left > 0) pool.set(key, left - 1);
    else changed.add(i);
  });
  return changed;
}

/**
 * The sentence a saved word came from, stored as the vocab entry's example.
 * A reply can run to several sentences, and a word is easier to remember in
 * the one sentence it was used in than in a whole paragraph.
 *
 * Splits after . ! ? and takes the first sentence containing the word (compared
 * the same way as changedWordIndices). Falls back to the whole text if nothing
 * matches, so an example is never dropped just because the split was imperfect.
 */
function sentenceContaining(text: string, word: string): string {
  const target = stripPunctuation(word).toLowerCase();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const match = sentences.find((sentence) =>
    sentence.split(/\s+/).some((token) => stripPunctuation(token).toLowerCase() === target),
  );
  return (match ?? text).trim();
}

function GlossedWord({
  word,
  translation,
  highlighted,
}: {
  word: string;
  translation: string | undefined;
  highlighted?: boolean;
}) {
  const body = highlighted ? (
    <span className="bg-orange text-on-bright rounded-[4px] px-1 font-bold">{word}</span>
  ) : (
    word
  );

  if (!translation) return <span>{body}</span>;

  return (
    <span className="group relative cursor-help border-b-2 border-dashed border-transparent hover:border-accent-ink">
      {body}
      <span className="bg-ink text-paper pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-10 -translate-x-1/2 rounded-[7px] px-[9px] py-[3px] font-mono text-xs whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        {translation}
      </span>
    </span>
  );
}

/**
 * Renders German text with per-word hover glosses.
 *
 * Words are flex items with a gap rather than text separated by whitespace, so
 * each one is its own hover target with its own dashed underline. That means
 * literal newlines don't survive -- fine for replies of a few sentences, which
 * is all this ever renders.
 */
function GlossedText({
  text,
  gloss,
  highlight,
  className,
}: {
  text: string;
  gloss: WordGloss | undefined;
  highlight?: Set<number>;
  className?: string;
}) {
  const byExact = new Map((gloss ?? []).map((g) => [stripPunctuation(g.word), g.translation]));
  const byLower = new Map(
    (gloss ?? []).map((g) => [stripPunctuation(g.word).toLowerCase(), g.translation]),
  );

  const tokens = text.split(/\s+/).filter(Boolean);

  return (
    <div className={`flex flex-wrap gap-x-[0.3em] ${className ?? ''}`}>
      {tokens.map((token, i) => {
        const key = stripPunctuation(token);
        return (
          <GlossedWord
            key={i}
            word={token}
            translation={byExact.get(key) ?? byLower.get(key.toLowerCase())}
            highlighted={highlight?.has(i)}
          />
        );
      })}
    </div>
  );
}

function GlossButton({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`border-line text-ink-2 hover:bg-yellow hover:text-on-bright flex-none cursor-pointer rounded-lg border-2 px-2 py-0.5 font-mono text-[11px] transition-colors duration-150 active:translate-x-px active:translate-y-px ${className ?? ''}`}
    >
      {open ? 'hide' : 'gloss'}
    </button>
  );
}

/**
 * The per-word save control, one per gloss row.
 *
 * Saved is a dead end by design: there's no unsave here, only on /vocab. That
 * makes `disabled` the honest state for an already-saved word rather than a
 * toggle that silently does nothing, and it keeps the button out of the tab
 * order once it has nothing left to do.
 */
function SaveWordButton({
  lemma,
  saved,
  onSave,
}: {
  lemma: string;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saved}
      // The glyph alone is meaningless to a screen reader ("plus"), and the
      // word it belongs to is a separate element, so the label carries both.
      // It names the lemma, which is what actually gets saved: on the "an" of
      // "rufe ... an" the button saves "anrufen", and the tooltip says so.
      aria-label={saved ? `${lemma} saved` : `Save ${lemma}`}
      title={saved ? `"${lemma}" saved` : `Save "${lemma}"`}
      className={
        saved
          ? 'border-hair text-ink-3 flex h-4.5 w-4.5 flex-none cursor-default items-center justify-center self-center rounded-[5px] border-2 font-mono text-[10px] leading-none'
          : 'border-line text-ink-2 hover:bg-yellow hover:text-on-bright flex h-4.5 w-4.5 flex-none cursor-pointer items-center justify-center self-center rounded-[5px] border-2 font-mono text-[11px] leading-none transition-colors duration-150 active:translate-x-px active:translate-y-px'
      }
    >
      {saved ? '✓' : '+'}
    </button>
  );
}

/**
 * Always mounted, collapsed by CSS rather than unmounted -- that's what lets
 * the open/close actually transition. Unmounting would make it pop.
 *
 * That trick has a cost now the rows hold buttons rather than plain text: a
 * collapsed panel is clipped to zero height but still in the document, so
 * without `inert` a keyboard user would tab into save buttons they cannot
 * see, and a screen reader would read out a panel nobody opened. `inert`
 * removes the subtree from both the tab order and the accessibility tree
 * while leaving it rendered, which is exactly the gap CSS-collapsing opens.
 *
 * `canSave` is false for anonymous visitors -- there's nowhere to save to --
 * which leaves the panel exactly as it was before.
 */
function GlossPanel({
  gloss,
  open,
  canSave,
  isSaved,
  onSave,
}: {
  gloss: WordGloss;
  open: boolean;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSave: (entry: WordGloss[number]) => void;
}) {
  return (
    <div className="gloss-panel" data-open={open} inert={!open}>
      <div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-x-6">
          {gloss.map((g, i) => (
            // items-center, not items-baseline: a translation that wraps onto
            // several lines makes its cell taller than the rest, and baseline
            // alignment pins everything to the first line, so the save button
            // and word drift to the top of the row. Centering keeps all three
            // cells on the row's vertical midline however tall one gets.
            <div key={i} className="border-hair flex items-center gap-2.5 border-b py-1 text-sm">
              {/* Glosses predating the `lemma` field have nothing to key a
                  saved word on, so those rows stay read-only rather than
                  saving an inflected form as though it were a headword. */}
              {canSave && g.lemma && (
                <SaveWordButton
                  lemma={g.lemma}
                  saved={isSaved(g.lemma)}
                  onSave={() => onSave(g)}
                />
              )}
              <span className="font-semibold">{g.word}</span>
              <span className="text-ink-2 ml-auto font-mono text-[11px]">{g.translation}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Chat({
  initialLevel,
  userEmail,
  userName,
  initialRemaining,
  messageCap,
  initialMessages,
  initialSavedLemmas,
  starters,
  initialConversationId,
  conversations,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
  userName: string | null;
  initialRemaining: number | null;
  messageCap: number;
  initialMessages: LangTutorUIMessage[];
  initialSavedLemmas: string[];
  starters: Starter[];
  initialConversationId: string | null;
  conversations: Conversation[];
}) {
  const [input, setInput] = useState('');
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [openGloss, setOpenGloss] = useState<Record<string, boolean>>({});
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
      const stored = localStorage.getItem(THEME_KEY);
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

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || capped) return;
    sendMessage({ text: trimmed }, { body: { conversationId: conversationId.current } });
    setInput('');
    setRemaining((r) => (r === null ? null : Math.max(0, r - 1)));
  }

  return (
    <div className="bg-paper text-ink flex min-h-dvh justify-center px-[18px] pb-6">
      <div className="flex min-h-dvh w-full max-w-[860px] flex-col">
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
        />

        {messages.length === 0 ? (
          <main className="flex flex-1 flex-col justify-center gap-[26px] py-10">
            <div className="flex flex-col gap-2.5">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.12em] uppercase">
                level {level}
                {remaining !== null && ` · ${remaining} free messages`}
              </span>
              <h1 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.025em]">
                Sag einfach etwas.
              </h1>
              <p className="text-ink-2 max-w-[48ch] text-base leading-relaxed">
                Write in German, however rough. You get a reply, a word-by-word translation, and a
                correction when something&apos;s off.
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
              // saved from the gloss panel below. See vocab-chips.tsx.
              // const vocabCandidates = message.parts.find(
              //   (p) => p.type === 'data-vocabCandidates',
              // )?.data;
              const rateLimited = message.parts.find((p) => p.type === 'data-rateLimited')?.data;
              const correctionPart = message.parts.find(
                (p): p is Extract<typeof p, { type: 'data-correction' }> =>
                  p.type === 'data-correction',
              );
              const correction = correctionPart?.data.hasMistake ? correctionPart.data : undefined;

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

              const replyOpen = openGloss[`${message.id}-reply`] ?? false;
              const corrOpen = openGloss[`${message.id}-corr`] ?? false;
              const streaming = status === 'streaming' && msgIndex === messages.length - 1;

              return (
                <div key={message.id} className="flex max-w-[92%] flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 text-[19px] leading-[1.6]">
                      <GlossedText text={text} gloss={replyGloss} />
                      {streaming && (
                        <span className="bg-accent ml-[3px] inline-block h-[18px] w-[9px] animate-[blink_1s_step-end_infinite] align-[-3px]" />
                      )}
                    </div>
                    {replyGloss && replyGloss.length > 0 && (
                      <GlossButton
                        open={replyOpen}
                        onToggle={() =>
                          setOpenGloss((s) => ({ ...s, [`${message.id}-reply`]: !replyOpen }))
                        }
                        className="mt-[5px]"
                      />
                    )}
                  </div>

                  {replyGloss && (
                    <GlossPanel
                      gloss={replyGloss}
                      open={replyOpen}
                      canSave={canSave}
                      isSaved={isSaved}
                      onSave={(entry) => saveWord(entry, 'new_word', text)}
                    />
                  )}

                  {streaming && !replyGloss && (
                    <div className="text-ink-3 flex animate-[fade-rise_240ms_ease-out] gap-3.5 font-mono text-[10px] tracking-[0.06em]">
                      <span>gloss …</span>
                    </div>
                  )}

                  {correction && correction.correction && (
                    <div className="border-line bg-panel relative animate-[fade-rise_240ms_ease-out] rounded-[14px] border-2 px-4 pt-[18px] pb-3.5 shadow-[3px_3px_0_var(--line)]">
                      <span className="border-line bg-orange text-on-bright absolute -top-[11px] left-3.5 rounded-md border-2 px-2 py-px font-mono text-[10px] tracking-[0.08em] uppercase">
                        {correction.mistakeType
                          ? MISTAKE_TYPE_LABELS[correction.mistakeType]
                          : 'grammar'}
                      </span>

                      <div className="flex items-start gap-3">
                        <GlossedText
                          className="flex-1 text-[18px] leading-[1.6]"
                          text={correction.correction}
                          gloss={correction.correctionGloss ?? undefined}
                          highlight={changedWordIndices(priorUserText, correction.correction)}
                        />
                        {correction.correctionGloss && correction.correctionGloss.length > 0 && (
                          <GlossButton
                            open={corrOpen}
                            onToggle={() =>
                              setOpenGloss((s) => ({ ...s, [`${message.id}-corr`]: !corrOpen }))
                            }
                            className="mt-[3px]"
                          />
                        )}
                      </div>

                      {correction.correctionGloss && (
                        <div className="mt-3">
                          {/* 'mistake', not 'new_word': a word met in a
                              correction is one the learner got wrong, and
                              /vocab can treat those differently. This is the
                              half the old chips couldn't reach at all --
                              they were built from the reply's gloss only. */}
                          <GlossPanel
                            gloss={correction.correctionGloss}
                            open={corrOpen}
                            canSave={canSave}
                            isSaved={isSaved}
                            onSave={(entry) => saveWord(entry, 'mistake', correction.correction ?? '')}
                          />
                        </div>
                      )}

                      <p className="text-ink-2 mt-3 font-mono text-[12.5px] leading-[1.6]">
                        {correction.explanation}
                      </p>
                    </div>
                  )}

                  {/* DEPRECATED: {vocabCandidates && <VocabChips candidates={vocabCandidates} />} */}
                </div>
              );
            })}

            {status === 'submitted' && (
              <div className="flex max-w-[92%] flex-col gap-2.5">
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
              placeholder={capped ? 'Sign in to keep going' : 'Schreib etwas auf Deutsch…'}
              className="border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] flex-1 rounded-full border-2 px-[18px] py-3 text-base outline-none transition-shadow duration-150 disabled:opacity-60"
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
