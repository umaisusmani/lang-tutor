'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { WordGloss } from '@/lib/gloss';

type GlossEntry = WordGloss[number];

/** Strips leading/trailing punctuation so a gloss entry still matches a word
 * that carries a comma or full stop in the sentence. */
export function stripPunctuation(word: string): string {
  return word.replace(/^[^\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]+$/g, '');
}

/**
 * What opens when a word is clicked: its meaning here, its dictionary form,
 * and the save control. This replaced the word-by-word panel under each
 * reply (QA: the panel was noise; saving belongs next to the word).
 *
 * The lemma line only shows when it says something the word doesn't -- on
 * "rufe" it's "anrufen", which is also what + saves, so the learner can see
 * why saving "rufe" adds "anrufen" to their list.
 *
 * Saved is a dead end by design: there's no unsave here, only on /vocab. That
 * makes `disabled` the honest state for an already-saved word rather than a
 * toggle that silently does nothing.
 */
function WordMenu({
  entry,
  canSave,
  saved,
  onSave,
}: {
  entry: GlossEntry;
  canSave: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const word = stripPunctuation(entry.word);
  const showLemma = !!entry.lemma && entry.lemma.toLowerCase() !== word.toLowerCase();

  return (
    <span
      role="dialog"
      aria-label={`${word}: ${entry.translation}`}
      className="border-line bg-panel text-ink absolute top-[calc(100%+7px)] left-1/2 z-20 flex w-max max-w-[240px] -translate-x-1/2 animate-[fade-rise_140ms_ease-out] flex-col gap-1.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm leading-snug shadow-[3px_3px_0_var(--line)]"
    >
      <span className="flex items-baseline gap-2">
        <span className="font-semibold">{word}</span>
        <span className="text-ink-2 font-mono text-[11px]">{entry.translation}</span>
      </span>

      {showLemma && (
        <span className="text-ink-3 font-mono text-[10.5px]">
          dictionary form: <span className="text-ink font-semibold">{entry.lemma}</span>
          {entry.lemmaTranslation && ` · ${entry.lemmaTranslation}`}
        </span>
      )}

      {/* Glosses predating the `lemma` field have nothing to key a saved word
          on, so those stay read-only rather than saving an inflected form. */}
      {entry.lemma &&
        (canSave ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saved}
            className={
              saved
                ? 'border-hair text-ink-3 self-start rounded-lg border-2 px-2 py-0.5 font-mono text-[11px]'
                : 'border-line text-ink-2 hover:bg-yellow hover:text-on-bright self-start cursor-pointer rounded-lg border-2 px-2 py-0.5 font-mono text-[11px] transition-colors duration-150 active:translate-x-px active:translate-y-px'
            }
          >
            {saved ? `✓ "${entry.lemma}" saved` : `+ save "${entry.lemma}"`}
          </button>
        ) : (
          <Link href="/login" className="self-start font-mono text-[11px]">
            sign in to save words
          </Link>
        ))}
    </span>
  );
}

/**
 * Renders German text word by word: hover a word for its meaning, click (or
 * tap -- there's no hover on touch) to pin the menu with the save button.
 *
 * Words are flex items with a gap rather than text separated by whitespace, so
 * each one is its own target with its own dashed underline. That means
 * literal newlines don't survive -- fine for replies of a few sentences, which
 * is all this ever renders.
 *
 * One open menu per block, closed by Escape or any press outside the block.
 * Pressing a word in ANOTHER block counts as outside, so across the whole
 * thread only one menu is ever open without any state shared between blocks.
 */
export function GlossedText({
  text,
  words,
  highlight,
  className,
  canSave,
  isSaved,
  onSave,
}: {
  text: string;
  words: WordGloss | undefined;
  highlight?: Set<number>;
  className?: string;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSave: (entry: GlossEntry) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenIndex(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenIndex(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openIndex]);

  const byExact = new Map((words ?? []).map((g) => [stripPunctuation(g.word), g]));
  const byLower = new Map((words ?? []).map((g) => [stripPunctuation(g.word).toLowerCase(), g]));

  const tokens = text.split(/\s+/).filter(Boolean);

  return (
    <div ref={rootRef} className={`flex flex-wrap gap-x-[0.3em] ${className ?? ''}`}>
      {tokens.map((token, i) => {
        const key = stripPunctuation(token);
        const entry = byExact.get(key) ?? byLower.get(key.toLowerCase());
        const body = highlight?.has(i) ? (
          <span className="bg-orange text-on-bright rounded-[4px] px-1 font-bold">{token}</span>
        ) : (
          token
        );

        if (!entry) return <span key={i}>{body}</span>;

        const open = openIndex === i;
        return (
          <span key={i} className="relative">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? null : i)}
              className={`group cursor-pointer border-b-2 border-dashed text-left ${
                open ? 'border-accent-ink' : 'border-transparent hover:border-accent-ink'
              }`}
            >
              {body}
              {/* Hover preview. Hidden while the menu is open, which says the
                  same thing and more. */}
              {!open && (
                <span className="bg-ink text-paper pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-10 -translate-x-1/2 rounded-[7px] px-[9px] py-[3px] font-mono text-xs font-normal whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                  {entry.translation}
                </span>
              )}
            </button>
            {open && (
              <WordMenu
                entry={entry}
                canSave={canSave}
                saved={!!entry.lemma && isSaved(entry.lemma)}
                onSave={() => onSave(entry)}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
