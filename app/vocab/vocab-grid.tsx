'use client';

import { useState } from 'react';

import { Pill } from '@/app/components/pill';
import { Select } from '@/app/components/select';
import { EditWord } from '@/app/vocab/edit-word';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<VocabEntry | null>(null);
  const activeFilterCount = Number(Boolean(query.trim())) + Number(filter !== 'all') + Number(sort !== 'newest');
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
      <Pill hitArea className="self-start sm:hidden" aria-expanded={filtersOpen}
        aria-controls="vocab-filter-controls" onClick={() => setFiltersOpen((open) => !open)}>
        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Pill>
      <div id="vocab-filter-controls" className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 sm:grid sm:grid-cols-[1fr_auto_auto]`}>
        <label className="flex flex-col gap-1 text-sm">
          Search your words
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="German, English, or an example…" className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span id="vocab-filter-label">Show</span>
          <Select variant="panel" value={filter} onValueChange={setFilter} aria-labelledby="vocab-filter-label"
            options={[{ value: 'all', label: 'All words' }, { value: 'due', label: 'Ready to review' }, { value: 'mistakes', label: 'From corrections' }, { value: 'missing', label: 'Missing meaning' }]} />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span id="vocab-sort-label">Sort</span>
          <Select variant="panel" value={sort} onValueChange={setSort} aria-labelledby="vocab-sort-label"
            options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'az', label: 'A–Z' }]} />
        </div>
      </div>
      <p className="text-ink-3 text-sm" role="status">{visible.length} of {entries.length} words shown</p>
      <Pill
        size="sm"
        hitArea
        onClick={toggleAll}
        aria-pressed={revealAll}
        className="self-end"
      >
        {revealAll ? 'hide all meanings' : 'show all meanings'}
      </Pill>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {visible.map((entry) => {
          const revealed = revealAll !== flipped.has(entry.id);
          const status = !entry.translation?.trim()
            ? 'Missing meaning · excluded from review'
            : due.has(entry.id) ? 'Ready to review' : null;
          return (
            // Keep the controls separate from the flip button: nested buttons
            // are invalid, and each action needs its own click target.
            <div
              key={entry.id}
              className={`group border-line relative flex min-h-[132px] flex-col rounded-[14px] border-2 transition-[background-color,box-shadow] ${
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
                className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 px-4 pt-3.5 text-left ${status ? 'pb-1' : 'pb-3.5'}`}
              >
                <span className="min-h-9 pr-20 text-[17px] font-semibold break-words">{entry.lemma}</span>
                {revealed ? (
                  <span className="flex min-w-0 animate-[fade-rise_160ms_ease-out] flex-col gap-1">
                    <span className="text-ink-2 text-sm break-words">
                      {entry.translation ?? 'no translation saved'}
                    </span>
                    {/* Where the learner met the word. Words saved before
                        examples were recorded have none. */}
                    {entry.example_sentence && (
                      <span className="text-ink-3 text-[13px] break-words italic">{entry.example_sentence}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-3 font-mono text-[10px]">tap to reveal</span>
                )}
              </button>

              {status && <span className="text-ink-3 px-4 pt-2 pb-3 text-xs">{status}</span>}
              <div className="absolute top-3 right-3.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <button type="button" aria-label={`Edit ${entry.lemma}`} title="Edit" onClick={() => setEditing(entry)}
                  className="text-ink-3 hover:text-ink focus-visible:text-ink hover:bg-soft focus-visible:bg-soft flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent shadow-none transition-colors">
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m10.5 3.5 2 2M2.5 13.5l3.2-.7 7.2-7.2a1.4 1.4 0 0 0-2-2L3.7 10.8l-1.2 2.7Z" />
                  </svg>
                </button>
                <RemoveWordButton entryId={entry.id} lemma={entry.lemma} />
              </div>
            </div>
          );
        })}
      </div>
      {visible.length === 0 && <div className="border-hair bg-panel rounded-xl border-2 p-5">
        <p>No words match these filters.</p>
        <Pill hitArea onClick={() => { setQuery(''); setFilter('all'); setSort('newest'); }} className="mt-2">Clear search and filters</Pill>
      </div>}
      {editing && <EditWord entry={editing} open onClose={() => setEditing(null)} />}
    </div>
  );
}
