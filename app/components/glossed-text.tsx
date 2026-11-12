'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { Pill } from '@/app/components/pill';
import { WordPopover } from '@/app/components/word-popover';
import type { WordGloss } from '@/lib/gloss';
import { lowercaseTargetText } from '@/lib/language-case';
import { stripPunctuation } from '@/lib/text';

type GlossEntry = WordGloss[number];


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
  anchorRef,
  popoverRef,
}: {
  entry: GlossEntry;
  canSave: boolean;
  saved: boolean;
  onSave: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const word = stripPunctuation(entry.word);
  const showLemma = !!entry.lemma && lowercaseTargetText(entry.lemma) !== lowercaseTargetText(word);

  return (
    <WordPopover
      anchorRef={anchorRef}
      popoverRef={popoverRef}
      role="dialog"
      aria-label={`${word}: ${entry.translation}`}
      className="border-line bg-panel text-ink z-[100] flex w-max max-w-[min(240px,calc(100vw-16px))] animate-[fade-rise_140ms_ease-out] flex-col gap-1.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm leading-snug shadow-[3px_3px_0_var(--line)]"
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
          <Pill
            size="sm"
            hitArea
            muted={saved}
            onClick={onSave}
            disabled={saved}
            className="self-start"
          >
            {saved ? `✓ "${entry.lemma}" saved` : `+ save "${entry.lemma}"`}
          </Pill>
        ) : (
          <Link href="/login" className="self-start font-mono text-[11px]">
            sign in to save words
          </Link>
        ))}
    </WordPopover>
  );
}

/**
 * Renders target-language text word by word: hover a word for its meaning, click (or
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLElement>(null);
  const previewAnchorRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node) && !popoverRef.current?.contains(e.target as Node)) setOpenIndex(null);
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
  const byLower = new Map((words ?? []).map((g) => [lowercaseTargetText(stripPunctuation(g.word)), g]));

  const tokens = text.split(/\s+/).filter(Boolean);

  return (
    <div ref={rootRef} className={`flex flex-wrap gap-x-[0.3em] ${className ?? ''}`}>
      {tokens.map((token, i) => {
        const key = stripPunctuation(token);
        const entry = byExact.get(key) ?? byLower.get(lowercaseTargetText(key));
        const body = highlight?.has(i) ? (
          <span className="bg-orange text-on-bright rounded-[4px] px-1 font-bold">{token}</span>
        ) : (
          token
        );

        if (!entry) return <span key={i}>{body}</span>;

        const open = openIndex === i;
        return (
          <span
            key={i}
            className="relative"
            onPointerEnter={(event) => { previewAnchorRef.current = event.currentTarget; setPreviewIndex(i); }}
            onPointerLeave={() => setPreviewIndex((current) => current === i ? null : current)}
            onFocus={(event) => { previewAnchorRef.current = event.currentTarget; setPreviewIndex(i); }}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewIndex(null); }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={(event) => { menuAnchorRef.current = event.currentTarget; setOpenIndex(open ? null : i); }}
              className={`group cursor-pointer border-b-2 border-dashed text-left ${
                open ? 'border-accent-ink' : 'border-accent-ink/40 hover:border-accent-ink focus:border-accent-ink'
              }`}
            >
              {body}
            </button>
            {!open && previewIndex === i && (
              <WordPopover
                anchorRef={previewAnchorRef}
                preferAbove
                className="bg-ink text-paper pointer-events-none z-[100] rounded-[7px] px-[9px] py-[3px] font-mono text-xs font-normal whitespace-nowrap"
              >
                {entry.translation}
              </WordPopover>
            )}
            {open && (
              <WordMenu
                entry={entry}
                canSave={canSave}
                saved={!!entry.lemma && isSaved(entry.lemma)}
                onSave={() => onSave(entry)}
                anchorRef={menuAnchorRef}
                popoverRef={popoverRef}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
