'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/app/components/button';
import { addStarterWordAction, previewStarterWordAction, searchStarterWordsAction, type DiscoverCard } from '@/app/vocab/actions';

export function AddWord({ savedLemmas, onAdded, onClose }: {
  savedLemmas: ReadonlySet<string>;
  onAdded: () => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const meaningId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const previewRef = useRef(0);
  const pendingRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscoverCard[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<DiscoverCard | null>(null);
  const [meaning, setMeaning] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [addedMessage, setAddedMessage] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [addedLemmas, setAddedLemmas] = useState<ReadonlySet<string>>(() => new Set());

  function isSaved(word: DiscoverCard) {
    const lemma = word.lemma.toLowerCase();
    return savedLemmas.has(lemma) || addedLemmas.has(lemma);
  }

  useEffect(() => {
    if (!query.trim() || selected) return;
    const request = requestRef.current;
    const timer = window.setTimeout(async () => {
      let words: DiscoverCard[];
      try {
        words = await searchStarterWordsAction(query);
      } catch {
        words = [];
      }
      if (request !== requestRef.current) return;
      setResults(words);
      setActive(-1);
      setOpen(words.length > 0 && document.activeElement === inputRef.current);
      setSearchedQuery(query);
      setAnnouncement(words.length ? `${words.length} suggestions` : 'No matches');
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  function changeQuery(value: string) {
    requestRef.current += 1;
    previewRef.current += 1;
    setQuery(value);
    setSelected(null);
    setMeaning('');
    setLookingUp(false);
    setError('');
    setAddedMessage('');
    setResults([]);
    setActive(-1);
    setOpen(false);
    setSearchedQuery('');
    setAnnouncement('');
  }

  async function select(word: DiscoverCard) {
    if (isSaved(word)) return;
    requestRef.current += 1;
    const preview = ++previewRef.current;
    setSelected(word);
    setQuery(word.lemma);
    setOpen(false);
    setActive(-1);
    setMeaning('');
    setError('');
    setAddedMessage('');
    setLookingUp(true);
    inputRef.current?.focus();
    try {
      const result = await previewStarterWordAction(word.lemma);
      if (preview !== previewRef.current) return;
      if (result?.translation) setMeaning(result.translation);
      else setError("Couldn't load a meaning. Type your own, or pick another word.");
    } catch {
      if (preview === previewRef.current) setError("Couldn't load a meaning. Type your own, or pick another word.");
    } finally {
      if (preview === previewRef.current) setLookingUp(false);
    }
  }

  function moveActive(direction: 1 | -1) {
    setOpen(true);
    const enabled = results.map((word, index) => isSaved(word) ? -1 : index).filter((index) => index >= 0);
    if (!enabled.length) return;
    const position = enabled.indexOf(active);
    const next = position < 0 ? (direction === 1 ? 0 : enabled.length - 1)
      : (position + direction + enabled.length) % enabled.length;
    setActive(enabled[next]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length) {
        event.preventDefault();
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
      }
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      void select(results[active]);
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else {
        changeQuery('');
      }
    }
  }

  async function add() {
    if (!selected || !meaning.trim() || lookingUp || pendingRef.current) return;
    pendingRef.current = true;
    setAdding(true);
    setError('');
    const word = selected;
    try {
      const result = await addStarterWordAction(word.lemma, meaning.trim());
      if (!result.ok) throw new Error('Save failed');
      setAddedLemmas((previous) => new Set([...previous, word.lemma.toLowerCase()]));
      changeQuery('');
      setAddedMessage(`✓ ${word.lemma} added`);
      onAdded();
      inputRef.current?.focus();
    } catch {
      setError("Couldn't add that word. Please try again.");
    } finally {
      pendingRef.current = false;
      setAdding(false);
    }
  }

  return (
    <section className="border-line bg-panel flex flex-col gap-3 rounded-2xl border-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="font-display text-xl">Add a word</label>
        <button type="button" onClick={onClose} className="text-ink-2 min-h-11 font-mono text-xs underline">close</button>
      </div>
      <div className="relative">
        <input ref={inputRef} id={inputId} type="text" value={query}
          onChange={(event) => changeQuery(event.target.value)} onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length && !selected) setOpen(true); }}
          onBlur={() => { setOpen(false); setActive(-1); }}
          role="combobox" aria-autocomplete="list" aria-expanded={open && results.length > 0}
          aria-controls={listboxId} aria-activedescendant={open && active >= 0 ? `${listboxId}-${active}` : undefined}
          placeholder="Type a German word…" autoComplete="off" autoCapitalize="none" autoCorrect="off"
          spellCheck={false} maxLength={50}
          className="border-line bg-panel w-full rounded-xl border-2 px-3 py-2" />
        {open && results.length > 0 && <ul role="listbox" id={listboxId}
          className="border-line bg-panel absolute top-full z-20 mt-1 max-h-[320px] w-full overflow-y-auto rounded-xl border-2 p-1.5 shadow-[3px_3px_0_var(--line)] animate-[fade-rise_160ms_ease-out]">
          {results.map((word, index) => {
            const saved = isSaved(word);
            return <li key={word.lemma} id={`${listboxId}-${index}`} role="option"
              aria-selected={active === index} aria-disabled={saved ? 'true' : undefined}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void select(word)}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${saved ? 'text-ink-3' : active === index ? 'bg-yellow text-on-bright' : 'hover:bg-soft cursor-pointer'}`}>
              <span className="min-w-0 font-semibold break-words">{word.lemma}</span>
              {saved && <span className="shrink-0 font-mono text-[11px]">✓ saved</span>}
            </li>;
          })}
        </ul>}
      </div>
      <span className="sr-only" role="status">{announcement}</span>
      {!selected && query.trim() && searchedQuery === query && results.length === 0 &&
        <p className="text-ink-3 text-sm">Not in the starter list. Try the Translate tab in the chat panel for other words.</p>}
      {selected && <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={meaningId} className="text-ink-3 font-mono text-[10px] uppercase tracking-[0.08em]">Meaning</label>
            <input id={meaningId} type="text" value={meaning} onChange={(event) => setMeaning(event.target.value)}
              disabled={lookingUp} placeholder={lookingUp ? 'Looking up the meaning…' : 'Type a meaning'}
              className="border-line bg-panel w-full rounded-xl border-2 px-3 py-2" />
          </div>
          <Button variant="primary" type="button" disabled={lookingUp || adding || !meaning.trim()} onClick={() => void add()}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        <div className="text-ink-3 text-sm">
          <p>{selected.example}</p>
          <p>{selected.exampleTranslation}</p>
        </div>
      </div>}
      {error && <p role="alert" className="text-ink-3 text-sm">{error}</p>}
      {addedMessage && <p role="status" className="text-ink-2 text-sm">{addedMessage}</p>}
    </section>
  );
}
