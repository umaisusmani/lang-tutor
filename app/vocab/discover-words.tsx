'use client';

import { useRef, useState } from 'react';
import { addStarterWordAction, previewStarterWordAction, type DiscoverCard } from './actions';

export function DiscoverWords({ words, onSkip, onFinish }: {
  words: DiscoverCard[];
  onSkip: (lemma: string) => void;
  onFinish: (added: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);
  const pending = useRef(false);
  const word = words[index];

  async function preview() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await previewStarterWordAction(word.lemma);
      if (!result) throw new Error('Missing meaning');
      setMeaning(result.translation);
    } catch {
      setError('Could not load the meaning. Try again or skip this word.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function resolve(add: boolean) {
    if (pending.current || (add && !meaning)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (add) {
        const result = await addStarterWordAction(word.lemma, meaning);
        if (!result.ok) throw new Error('Save failed');
        setAdded((count) => count + 1);
      } else onSkip(word.lemma);
      if (index === words.length - 1) onFinish(added + Number(add));
      else {
        setIndex((value) => value + 1);
        setMeaning('');
      }
    } catch {
      setError('Could not add this word. Please try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="discover-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="discover-heading" className="font-display text-2xl">Discover new words</h2>
        <button disabled={busy} onClick={() => onFinish(added)} className="border-line rounded-full border-2 px-4 py-2 text-sm disabled:opacity-50">
          Back to vocabulary
        </button>
      </div>
      <p className="text-ink-2 text-sm" role="status">Word {index + 1} of {words.length} · {added} added</p>
      <div className="border-line bg-panel mx-auto flex w-full max-w-[600px] flex-col gap-5 rounded-2xl border-2 p-6">
        <h3 className="font-display text-center text-4xl break-words">{word.lemma}</h3>
        {meaning && <div className="flex flex-col gap-3 text-center" role="status">
          <p className="text-xl font-semibold">{meaning}</p>
          <p>{word.example}</p>
          <p className="text-ink-2 italic">{word.exampleTranslation}</p>
        </div>}
        {error && <p role="alert" className="text-ink rounded-xl border-2 border-orange p-3">{error}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <button disabled={busy} onClick={() => void resolve(false)} className="border-line rounded-xl border-2 px-4 py-3 disabled:opacity-50">Skip word</button>
          <button disabled={busy} onClick={() => void (meaning ? resolve(true) : preview())}
            className="border-line bg-yellow text-on-bright font-display rounded-xl border-2 px-4 py-3 shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50">
            {busy ? 'Please wait…' : meaning ? 'Add to my vocabulary' : 'Show meaning and example'}
          </button>
        </div>
      </div>
    </section>
  );
}
