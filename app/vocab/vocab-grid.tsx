'use client';

import { useState } from 'react';

import { RemoveWordButton } from '@/app/vocab/remove-word-button';
import type { VocabEntry } from '@/lib/types/db';

/**
 * Saved words as flashcards: the German shows, the meaning is a click away,
 * so the list doubles as self-testing rather than a page of answers.
 *
 * State is "show all" plus the cards flipped away from it. A card is revealed
 * when exactly one of those says so -- so with show-all on, clicking a card
 * hides just that one. Flipping show-all clears the individual flips, so the
 * toggle always leaves every card in the state it names. Not remembered
 * between visits on purpose: the page opens hidden, ready to test.
 */
export function VocabGrid({ entries }: { entries: VocabEntry[] }) {
  const [revealAll, setRevealAll] = useState(false);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());

  function toggleCard(id: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setRevealAll((v) => !v);
    setFlipped(new Set());
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggleAll}
        aria-pressed={revealAll}
        className="border-line text-ink-2 hover:bg-yellow hover:text-on-bright self-end cursor-pointer rounded-full border-2 px-3 py-1 font-mono text-[11px] transition-colors duration-150 active:translate-x-px active:translate-y-px"
      >
        {revealAll ? 'hide all meanings' : 'show all meanings'}
      </button>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {entries.map((entry) => {
          const revealed = revealAll !== flipped.has(entry.id);
          return (
            // The card is a div holding two buttons side by side, not one big
            // button: remove can't sit inside the flip button (a button in a
            // button is invalid HTML), and positioned over it would still
            // trigger the flip on its way to the remove.
            <div
              key={entry.id}
              className={`border-line relative flex min-h-[112px] flex-col rounded-[14px] border-2 transition-shadow ${
                revealed ? 'bg-soft' : 'bg-panel hover:shadow-[3px_3px_0_var(--line)]'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleCard(entry.id)}
                aria-expanded={revealed}
                className="flex flex-1 cursor-pointer flex-col gap-1.5 px-4 pt-3.5 pb-9 text-left"
              >
                <span className="pr-12 text-[17px] font-semibold break-words">{entry.lemma}</span>
                {revealed ? (
                  <span className="flex animate-[fade-rise_160ms_ease-out] flex-col gap-1">
                    <span className="text-ink-2 font-mono text-[11px]">
                      {entry.translation ?? 'no translation saved'}
                    </span>
                    {/* Where the learner met the word. Words saved before
                        examples were recorded have none. */}
                    {entry.example_sentence && (
                      <span className="text-ink-3 text-[13px] italic">{entry.example_sentence}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-3 font-mono text-[10px]">tap to reveal</span>
                )}
              </button>

              <span className="text-ink-3 pointer-events-none absolute bottom-2.5 left-4 font-mono text-[10px]">
                {new Date(entry.created_at).toLocaleDateString()}
              </span>
              <div className="absolute top-3 right-3.5">
                <RemoveWordButton entryId={entry.id} lemma={entry.lemma} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
