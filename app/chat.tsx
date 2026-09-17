'use client';

import { useChat } from '@ai-sdk/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { saveLevel, signOut } from '@/app/auth/actions';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { WordGloss } from '@/lib/gloss';
import { MISTAKE_TYPES } from '@/lib/mistake-types';
import { CEFR_LEVELS, isCefrLevel, type CefrLevel } from '@/lib/prompts';

// Splits on runs of German word-characters (incl. umlauts/ß) vs everything
// else (whitespace, punctuation), so each word-chunk can be looked up against
// a WordGloss entry independently while non-word chunks render untouched.
const WORD_SPLIT_RE = /([\wäöüÄÖÜß]+)/g;

/**
 * Renders `text` with every word that has a matching gloss entry wrapped in a
 * hoverable span. Uses a CSS group-hover tooltip rather than the native
 * `title` attribute -- `title`'s tooltip is browser-styled (delayed, can't be
 * themed, looks different per OS), whereas this one matches the app and shows
 * instantly.
 *
 * Matching is exact-string-first, falling back to case-insensitive, since the
 * gloss prompt asks the model to copy each word exactly as it appears in the
 * source but a model can still drift on capitalization at a sentence
 * boundary. Words with no match (a gloss miss, or plain punctuation/
 * whitespace chunks) render as plain text -- hover just does nothing for those,
 * rather than showing something misleading.
 */
// Strips leading/trailing punctuation the model may have attached despite the
// prompt asking it not to (observed: a sentence-final period glued onto the
// last word, e.g. "Kinder." instead of "Kinder"). Defense-in-depth rather than
// trusting the prompt alone -- the tokenizer below never produces trailing
// punctuation in a word-chunk, so an ungroomed gloss key would silently never
// match anything.
function stripPunctuation(word: string): string {
  return word.replace(/^[^\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]+$/g, '');
}

function GlossedWord({ word, translation }: { word: string; translation: string }) {
  return (
    <span className="group relative inline-block">
      <span className="cursor-help rounded border border-dashed border-transparent hover:border-zinc-400 dark:hover:border-zinc-500">
        {word}
      </span>
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap text-zinc-50 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {translation}
      </span>
    </span>
  );
}

function GlossedText({ text, gloss }: { text: string; gloss: WordGloss | undefined }) {
  if (!gloss || gloss.length === 0) return <>{text}</>;

  const byExact = new Map(gloss.map((g) => [stripPunctuation(g.word), g.translation]));
  const byLower = new Map(gloss.map((g) => [stripPunctuation(g.word).toLowerCase(), g.translation]));

  const chunks = text.split(WORD_SPLIT_RE);

  return (
    <>
      {chunks.map((chunk, i) => {
        const translation = byExact.get(chunk) ?? byLower.get(chunk.toLowerCase());
        if (!translation) return <span key={i}>{chunk}</span>;
        return <GlossedWord key={i} word={chunk} translation={translation} />;
      })}
    </>
  );
}

/**
 * The small icon + toggle that reveals the full word list at once, as an
 * alternative to hovering each word individually. Same gloss data either way
 * -- this just changes how much of it is visible without hovering.
 */
function GlossToggle({ gloss }: { gloss: WordGloss | undefined }) {
  const [open, setOpen] = useState(false);
  if (!gloss || gloss.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Word-by-word translation"
        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        🔤
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
          {gloss.map((g, i) => (
            <span key={i}>
              <span className="text-zinc-500">{g.word}</span>{' '}
              <span className="text-zinc-400">→</span> {g.translation}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Human-readable labels for the side-panel display. Rough placeholder --
// the real design pass (step 7) will handle this properly.
const MISTAKE_TYPE_LABELS: Record<(typeof MISTAKE_TYPES)[number], string> = {
  word_order: 'Word order',
  case_declension: 'Case',
  gender_article: 'Gender/article',
  verb_conjugation: 'Verb conjugation',
  auxiliary_verb: 'Auxiliary verb',
  preposition: 'Preposition',
  adjective_ending: 'Adjective ending',
  plural_form: 'Plural form',
  word_choice: 'Word choice',
  other: 'Grammar',
};

const LEVEL_COOKIE = 'cefr_level';

function writeLevelCookie(level: CefrLevel) {
  // One year, available on every path, since /api/chat needs to read it too.
  document.cookie = `${LEVEL_COOKIE}=${level}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function Chat({
  initialLevel,
  userEmail,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
}) {
  const [input, setInput] = useState('');
  // Server already resolved this (profile for signed-in users, cookie
  // otherwise), so unlike before there's no post-mount cookie sync needed.
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const { messages, sendMessage, status, error } = useChat<LangTutorUIMessage>();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';

  function handleLevelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!isCefrLevel(next)) return;
    setLevel(next);

    // Signed-in users get it persisted to their profile; the cookie is still
    // written either way so /api/chat has a consistent fallback to read.
    writeLevelCookie(next);
    if (userEmail) void saveLevel(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold">Lang Tutor</h1>
            <span className="text-xs text-zinc-500">Deutsch üben</span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              Level
              <select
                value={level}
                onChange={handleLevelChange}
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            {userEmail ? (
              <form action={signOut}>
                <button
                  type="submit"
                  title={userEmail}
                  className="text-xs text-zinc-500 underline underline-offset-4"
                >
                  Abmelden
                </button>
              </form>
            ) : (
              <Link href="/login" className="text-xs text-zinc-500 underline underline-offset-4">
                Anmelden
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-sm text-zinc-500">
            Sag einfach Hallo — schreib etwas auf Deutsch, um anzufangen.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((message) => {
            // The reply's own word-by-word gloss, fetched unconditionally
            // (see lib/gloss.ts) but only ever revealed by hover/icon here.
            const replyGloss = message.parts.find((p) => p.type === 'data-gloss')?.data;

            return (
              <div
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                {/* Everything for one message -- bubble, gloss toggle,
                    correction panel -- stacks in this single column so it
                    aligns and wraps as one unit. Without this wrapper, each
                    piece was a sibling in the outer flex-ROW above, competing
                    for horizontal space: the correction panel happened to be
                    wide enough to look right by accident, but the small
                    gloss-toggle icon just floated beside the bubble instead
                    of under it. */}
                <div className="flex max-w-[85%] flex-col gap-1">
                  <div
                    className={
                      message.role === 'user'
                        ? 'rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm whitespace-pre-wrap text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2 text-sm whitespace-pre-wrap dark:border-zinc-800 dark:bg-zinc-900'
                    }
                  >
                    {message.parts.map((part, i) =>
                      part.type === 'text' ? (
                        <GlossedText key={`${message.id}-${i}`} text={part.text} gloss={replyGloss} />
                      ) : null,
                    )}
                  </div>

                  {message.role === 'assistant' && <GlossToggle gloss={replyGloss} />}

                  {/* Rough correction area -- one data-correction part per
                      assistant message, written by the route while the reply
                      streams. Real layout comes in step 7's design pass. */}
                  {message.role === 'assistant' &&
                    message.parts
                      .filter((p) => p.type === 'data-correction' && p.data.hasMistake)
                      .map((p, i) => {
                        if (p.type !== 'data-correction') return null;
                        const c = p.data;
                        return (
                          <div
                            key={`${message.id}-correction-${i}`}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          >
                            <span className="font-semibold">
                              {c.mistakeType ? MISTAKE_TYPE_LABELS[c.mistakeType] : 'Grammar'}:
                            </span>{' '}
                            {c.correction && (
                              <GlossedText text={c.correction} gloss={c.correctionGloss ?? undefined} />
                            )}
                            <br />
                            <span className="opacity-80">{c.explanation}</span>
                            <GlossToggle gloss={c.correctionGloss ?? undefined} />
                          </div>
                        );
                      })}
                </div>
              </div>
            );
          })}

          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                …
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Etwas ist schiefgelaufen. Bitte versuch es noch einmal.
            </p>
          )}
        </div>

        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Schreib auf Deutsch…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Senden
          </button>
        </div>
      </form>
    </div>
  );
}
