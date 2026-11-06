'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/app/components/button';
import { addLookedUpWordAction, addStarterWordAction, lookupWordsAction,
  previewStarterWordAction, searchStarterWordsAction, type DiscoverCard, type LookedUpWord } from '@/app/vocab/actions';

type Option = { kind: 'starter'; word: DiscoverCard } | { kind: 'lookup'; word: LookedUpWord } | { kind: 'more' };
type Selected = Extract<Option, { kind: 'starter' | 'lookup' }>;
const lookupKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function AddWord({ savedLemmas, onAdded }: { savedLemmas: ReadonlySet<string>; onAdded: () => void }) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const focusSearchRef = useRef(false);
  const requestRef = useRef(0);
  const previewRef = useRef(0);
  const lookupRef = useRef(0);
  const pendingRef = useRef(false);
  const cacheRef = useRef(new Map<string, LookedUpWord[]>());
  const remainingRef = useRef(new Map<string, number | undefined>());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscoverCard[]>([]);
  const [lookupResults, setLookupResults] = useState<LookedUpWord[]>([]);
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [remaining, setRemaining] = useState<number | undefined>();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [meaning, setMeaning] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [addedMessage, setAddedMessage] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [addedLemmas, setAddedLemmas] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => { inputRef.current?.focus(); }, []);

  const isSaved = (lemma: string) => savedLemmas.has(lemma.toLowerCase()) || addedLemmas.has(lemma.toLowerCase());
  const options: Option[] = [
    ...results.map((word): Option => ({ kind: 'starter', word })),
    ...(query.trim().length >= 3 && searchedQuery === query && !lookupDone ? [{ kind: 'more' } as Option] : []),
    ...lookupResults.map((word): Option => ({ kind: 'lookup', word })),
  ];
  const showMenu = open && !selected && Boolean(query.trim()) && !searchPending;

  const runLookup = useCallback(async (value: string) => {
    const key = lookupKey(value);
    if (cacheRef.current.has(key)) {
      setLookupResults(cacheRef.current.get(key)!);
      setLookupDone(true);
      setLookupError('');
      setRemaining(remainingRef.current.get(key));
      setOpen(true);
      return;
    }
    const request = ++lookupRef.current;
    setLookupPending(true);
    setLookupError('');
    setOpen(true);
    try {
      const response = await lookupWordsAction(value.trim());
      if (request !== lookupRef.current) return;
      setRemaining(response.remaining);
      remainingRef.current.set(key, response.remaining);
      if (response.error) setLookupError(response.error);
      else {
        cacheRef.current.set(key, response.words);
        setLookupResults(response.words);
        setLookupDone(true);
      }
    } catch {
      if (request === lookupRef.current) setLookupError('Could not look up words. Please try again.');
    } finally {
      if (request === lookupRef.current) setLookupPending(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim() || selected) return;
    const request = requestRef.current;
    const timer = window.setTimeout(async () => {
      let words: DiscoverCard[];
      try { words = await searchStarterWordsAction(query); }
      catch { words = []; }
      if (request !== requestRef.current) return;
      setResults(words.slice(0, 5));
      setSearchPending(false);
      setActive(-1);
      setOpen(document.activeElement === inputRef.current);
      setSearchedQuery(query);
      setAnnouncement(words.length ? `${words.length} suggestions` : 'No matches');
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  useEffect(() => {
    if (selected) selectedRef.current?.focus();
    else if (focusSearchRef.current) {
      inputRef.current?.focus();
      focusSearchRef.current = false;
    }
  }, [selected]);

  function changeQuery(value: string) {
    requestRef.current++;
    previewRef.current++;
    lookupRef.current++;
    setQuery(value);
    setSearchPending(Boolean(value.trim()));
    setSelected(null);
    setMeaning('');
    setLookingUp(false);
    setLookupResults(cacheRef.current.get(lookupKey(value)) ?? []);
    setLookupDone(cacheRef.current.has(lookupKey(value)));
    setLookupPending(false);
    setLookupError('');
    setRemaining(remainingRef.current.get(lookupKey(value)));
    setError('');
    setAddedMessage('');
    setResults([]);
    setActive(-1);
    setOpen(false);
    setSearchedQuery('');
    setAnnouncement('');
  }

  function cancel() {
    focusSearchRef.current = true;
    changeQuery('');
  }

  async function select(option: Option) {
    if (option.kind === 'more') {
      if (!lookupPending && !lookupDone) void runLookup(query);
      return;
    }
    if (isSaved(option.word.lemma)) return;
    requestRef.current++;
    lookupRef.current++;
    const preview = ++previewRef.current;
    setSelected(option);
    setSearchPending(false);
    setLookupPending(false);
    setOpen(false);
    setActive(-1);
    setMeaning(option.kind === 'lookup' ? option.word.meaning : '');
    setError('');
    setAddedMessage('');
    setLookingUp(option.kind === 'starter');
    if (option.kind === 'lookup') return;
    try {
      const response = await previewStarterWordAction(option.word.lemma);
      if (preview !== previewRef.current) return;
      if (response?.translation) setMeaning(response.translation);
      else setError("Couldn't load a meaning. Type your own, or pick another word.");
    } catch {
      if (preview === previewRef.current) setError("Couldn't load a meaning. Type your own, or pick another word.");
    } finally {
      if (preview === previewRef.current) setLookingUp(false);
    }
  }

  function moveActive(direction: 1 | -1) {
    const enabled = options.map((option, index) => option.kind !== 'more' && isSaved(option.word.lemma) ? -1 : index)
      .filter((index) => index >= 0);
    if (!enabled.length) return;
    const position = enabled.indexOf(active);
    setActive(position < 0 ? (direction === 1 ? enabled[0] : enabled[enabled.length - 1])
      : enabled[(position + direction + enabled.length) % enabled.length]);
    setOpen(true);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && showMenu && active >= 0) {
      event.preventDefault();
      void select(options[active]);
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else changeQuery('');
    }
  }

  async function add() {
    if (!selected || !meaning.trim() || lookingUp || pendingRef.current) return;
    pendingRef.current = true;
    setAdding(true);
    setError('');
    const current = selected;
    try {
      const result = current.kind === 'starter'
        ? await addStarterWordAction(current.word.lemma, meaning.trim())
        : await addLookedUpWordAction({ ...current.word, meaning: meaning.trim() });
      if (!result.ok) throw new Error('Save failed');
      setAddedLemmas((previous) => new Set([...previous, current.word.lemma.toLowerCase()]));
      focusSearchRef.current = true;
      changeQuery('');
      setAddedMessage(`✓ ${current.word.lemma} added`);
      onAdded();
    } catch {
      setError("Couldn't add that word. Please try again.");
    } finally {
      pendingRef.current = false;
      setAdding(false);
    }
  }

  function handleSelectedKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && (event.target === event.currentTarget || event.target instanceof HTMLInputElement)
      && meaning.trim() && !lookingUp) {
      event.preventDefault();
      void add();
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {!selected && <label htmlFor={inputId} className="text-ink-2 text-sm">Search for a word</label>}
      <div className="relative min-w-0">
        {selected ? <div ref={selectedRef} tabIndex={0} onKeyDown={handleSelectedKeyDown}
          className="border-line bg-panel flex flex-col gap-3 rounded-xl border-2 p-3 outline-offset-2">
          <div className="min-w-0">
            <div className="font-display text-2xl leading-tight">{selected.word.lemma}</div>
            {lookingUp ? <span className="text-ink-2 inline-flex items-center gap-2 font-mono text-xs">
              <span aria-hidden="true" className="border-ink-3 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
              looking up the meaning…
            </span> : <label className="text-ink-2 mt-3 flex flex-col gap-1 text-sm">Meaning
              <input value={meaning} onChange={(event) => setMeaning(event.target.value)}
                placeholder="Type a meaning" maxLength={500}
                className="border-line bg-panel text-ink w-full rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
            </label>}
            {(selected.word.example || selected.word.exampleTranslation) && <div className="text-ink-2 mt-2 text-sm">
              <p>{selected.word.example}</p>
              <p className="font-mono text-xs">{selected.word.exampleTranslation}</p>
            </div>}
          </div>
          <div className="mt-2 flex justify-end gap-2.5">
            <Button type="button" variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
            <Button type="button" variant="primary" size="sm"
              disabled={adding || lookingUp || !meaning.trim()} onClick={() => void add()}>{adding ? 'Adding…' : 'Add word'}</Button>
          </div>
        </div> : <>
          <input ref={inputRef} id={inputId} type="text" value={query} autoFocus
            onChange={(event) => changeQuery(event.target.value)} onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (searchedQuery === query && query.trim()) setOpen(true); }}
            onBlur={() => { setOpen(false); setActive(-1); }}
            role="combobox" aria-autocomplete="list" aria-expanded={showMenu}
            aria-busy={searchPending} aria-controls={listboxId}
            aria-activedescendant={showMenu && active >= 0 ? `${listboxId}-${active}` : undefined}
            placeholder="Type a word in German or English…" autoComplete="off" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} maxLength={50}
            className="border-line bg-panel text-ink w-full rounded-xl border-2 px-3 py-2.5 pr-10 text-sm outline-none" />
          {searchPending && <span role="status" aria-label="Searching suggestions" className="border-ink-3 absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />}
          {showMenu && <ul role="listbox" id={listboxId}
            className="border-line bg-panel mt-1 max-h-[320px] w-full overflow-y-auto rounded-xl border-2 p-1.5 animate-[fade-rise_160ms_ease-out]">
            {results.map((word, index) => <li key={`starter-${word.lemma}`} id={`${listboxId}-${index}`} role="option"
              aria-selected={active === index} aria-disabled={isSaved(word.lemma) ? 'true' : undefined}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void select({ kind: 'starter', word })}
              className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${isSaved(word.lemma) ? 'text-ink-3' : active === index ? 'bg-yellow text-on-bright' : 'hover:bg-soft cursor-pointer'}`}>
              <span className="min-w-0 font-semibold break-words">{word.lemma}</span>
              {isSaved(word.lemma) && <span className="shrink-0 font-mono text-[11px]">✓ saved</span>}
            </li>)}
            {query.trim().length >= 3 && searchedQuery === query && !lookupDone && <li id={`${listboxId}-${results.length}`} role="option" aria-selected={active === results.length}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void select({ kind: 'more' })}
              className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 font-mono text-xs cursor-pointer ${active === results.length ? 'bg-yellow text-on-bright' : 'hover:bg-soft'}`}>
              {lookupPending && <span aria-hidden="true" className="border-ink-3 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />}
              {lookupPending ? 'Looking up…' : 'Search more words · uses one daily translation'}
            </li>}
            {lookupResults.length > 0 && <li aria-hidden="true" className="text-ink-3 px-2.5 pt-2 font-mono text-[10px] uppercase">More words</li>}
            {lookupResults.map((word, offset) => {
              const index = results.length + (query.trim().length >= 3 && searchedQuery === query && !lookupDone ? 1 : 0) + offset;
              return <li key={`lookup-${word.lemma}`} id={`${listboxId}-${index}`} role="option"
                aria-selected={active === index} aria-disabled={isSaved(word.lemma) ? 'true' : undefined}
                onMouseDown={(event) => event.preventDefault()} onClick={() => void select({ kind: 'lookup', word })}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${isSaved(word.lemma) ? 'text-ink-3' : active === index ? 'bg-yellow text-on-bright' : 'hover:bg-soft cursor-pointer'}`}>
                <span className="min-w-0"><span className="font-semibold break-words">{word.lemma}</span>
                  <span className="text-ink-2 ml-2 font-mono text-xs">{word.meaning}</span></span>
                {isSaved(word.lemma) && <span className="shrink-0 font-mono text-[11px]">✓ saved</span>}
              </li>;
            })}
            {lookupError && <li role="alert" className="text-ink-2 px-2.5 py-2 text-sm">{lookupError}</li>}
            {remaining !== undefined && <li className="text-ink-3 px-2.5 py-2 font-mono text-xs">{remaining} translations left today</li>}
            {!options.length && !lookupError && <li className="text-ink-3 px-2.5 py-2 text-sm">
              {lookupPending ? 'Looking up…' : 'No matches'}
            </li>}
          </ul>}
        </>}
      </div>
      <span className="sr-only" role="status">{announcement}</span>
      {error && <p role="alert" className="text-ink-3 text-sm">{error}</p>}
      {addedMessage && <p role="status" className="text-ink-2 text-sm">{addedMessage}</p>}
    </section>
  );
}
