'use client';

import { useState } from 'react';

import { Pill } from '@/app/components/pill';
import { Select } from '@/app/components/select';
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
export function VocabGrid({ entries, dueWordIds }: { entries: VocabEntry[]; dueWordIds: string[] }) {
  const [revealAll, setRevealAll] = useState(false);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const due = new Set(dueWordIds);
  const search = query.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) => (
    `${entry.lemma} ${entry.translation ?? ''} ${entry.example_sentence ?? ''}`.toLocaleLowerCase().includes(search)
    && (filter === 'all' || (filter === 'due' && due.has(entry.id))
      || (filter === 'missing' && !entry.translation?.trim())
      || (filter === 'mistakes' && entry.source === 'mistake'))
  )).sort((a, b) => sort === 'az'
    ? a.lemma.localeCompare(b.lemma, 'de')
    : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));

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
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="flex flex-col gap-1 text-sm">
          Find a word
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="German, English, or an example…" className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Show
          <Select variant="panel" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All words</option><option value="due">Ready to review</option>
            <option value="mistakes">From corrections</option><option value="missing">Missing meaning</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort
          <Select variant="panel" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="az">A–Z</option>
          </Select>
        </label>
      </div>
      <p className="text-ink-3 text-sm" role="status">{visible.length} of {entries.length} words shown</p>
      <Pill
        size="sm"
        onClick={toggleAll}
        aria-pressed={revealAll}
        className="self-end"
      >
        {revealAll ? 'hide all meanings' : 'show all meanings'}
      </Pill>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {visible.map((entry) => {
          const revealed = revealAll !== flipped.has(entry.id);
          return (
            // The card is a div holding two buttons side by side, not one big
            // button: remove can't sit inside the flip button (a button in a
            // button is invalid HTML), and positioned over it would still
            // trigger the flip on its way to the remove.
            <div
              key={entry.id}
              className={`border-line relative flex min-h-[112px] flex-col rounded-[14px] border-2 transition-[background-color,box-shadow] ${
                // `bg-soft` used to mark "revealed", but --soft sits only
                // ~0.07 (light) / ~0.04 (dark) lightness away from --panel --
                // close enough that the two card states read as nearly
                // identical in both themes. A tint of --accent-ink instead:
                // that token is chosen specifically to contrast with the
                // panel color in both themes (it's what text sits in on a
                // bright fill), so even a faint wash of it stays visible
                // either way.
                revealed
                  ? 'bg-accent-ink/[0.08]'
                  : 'bg-panel hover:shadow-[3px_3px_0_var(--line)]'
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
                    <span className="text-ink-2 text-sm">
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

              <span className="text-ink-3 pointer-events-none absolute bottom-2.5 left-4 text-xs">
                {!entry.translation?.trim() ? 'Missing meaning · excluded from review' : due.has(entry.id) ? 'Ready to review' : 'Saved for later'}
              </span>
              <div className="absolute top-3 right-3.5">
                <RemoveWordButton entryId={entry.id} lemma={entry.lemma} />
              </div>
            </div>
          );
        })}
      </div>
      {visible.length === 0 && <div className="border-hair bg-panel rounded-xl border-2 p-5">
        <p>No words match these filters.</p>
        <button onClick={() => { setQuery(''); setFilter('all'); }} className="mt-2 underline">Clear search and filters</button>
      </div>}
    </div>
  );
}
