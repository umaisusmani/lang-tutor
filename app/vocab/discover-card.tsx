'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/app/components/button';
import { addStarterWordAction, previewStarterWordsAction, type DiscoverCard as DiscoverWord } from '@/app/vocab/actions';

export function useDiscoverMeanings(words: DiscoverWord[]) {
  const [meanings, setMeanings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(words.length > 0);
  const [error, setError] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  async function loadMissing(existing: Record<string, string>) {
    if (pendingRef.current) return;
    const missing = words.map((word) => word.lemma).filter((lemma) => !existing[lemma]);
    if (!missing.length) return;
    pendingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const result = await previewStarterWordsAction(missing);
      if (!mountedRef.current) return;
      setMeanings((previous) => ({ ...previous, ...result }));
      if (missing.some((lemma) => !result[lemma]?.trim())) setError(true);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => { if (mountedRef.current) void loadMissing({}); });
    return () => { mountedRef.current = false; };
    // The session's word list is fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  return { meanings, loading, error, retry: () => loadMissing(meanings) };
}

export function DiscoverCard({ word, meaning, loading, loadError, onRetry, onSkip, onAdded, skipLabel = 'Skip' }: {
  word: DiscoverWord;
  meaning?: string;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onSkip: (lemma: string) => void;
  onAdded: () => void;
  skipLabel?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [added, setAdded] = useState(false);
  const [ownMeaning, setOwnMeaning] = useState('');
  const savingRef = useRef(false);
  const chosenMeaning = meaning?.trim() || ownMeaning.trim();

  async function add() {
    if (!chosenMeaning || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      const result = await addStarterWordAction(word.lemma, chosenMeaning);
      if (!result.ok) throw new Error('Save failed');
      setAdded(true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      onAdded();
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <div className="border-line bg-panel mx-auto flex min-h-[300px] w-full max-w-[600px] animate-[fade-rise_180ms_ease-out] flex-col gap-5 rounded-2xl border-2 p-6 shadow-[3px_3px_0_var(--line)]">
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-ink-3 font-mono text-xs uppercase tracking-wider">New word</p>
      <h3 className="font-display text-4xl break-words">{word.lemma}</h3>
      <p className="font-mono text-xl font-semibold" role="status">{meaning || (loading ? 'Loading meaning…' : 'Meaning unavailable')}</p>
      {!meaning?.trim() && !loading && <input aria-label="Meaning" placeholder="Type your own meaning" maxLength={500}
        value={ownMeaning} onChange={(event) => setOwnMeaning(event.target.value)}
        className="border-line bg-panel w-full max-w-sm rounded-xl border-2 px-3 py-2 text-center" />}
      <p>{word.example}</p>
      <p className="text-ink-2 font-mono text-sm">{word.exampleTranslation}</p>
    </div>
    {loadError && !meaning && <p role="alert" className="text-ink rounded-xl border-2 border-orange p-3">
      Could not load the meaning. <button type="button" className="font-bold underline" onClick={onRetry}>try again</button>
    </p>}
    {saveError && <p role="alert" className="text-ink rounded-xl border-2 border-orange p-3">Could not add this word. Please try again.</p>}
    <div className="flex flex-wrap justify-center gap-3">
      <Button variant="primary" type="button" disabled={!chosenMeaning || saving} onClick={() => void add()}>
        {saving ? 'Adding…' : 'Add to my words'}
        {added && <span aria-hidden="true" className="animate-[fade-rise_160ms_ease-out]">✓</span>}
      </Button>
      <Button variant="secondary" type="button" disabled={saving} onClick={() => onSkip(word.lemma)}>{skipLabel}</Button>
    </div>
  </div>;
}
