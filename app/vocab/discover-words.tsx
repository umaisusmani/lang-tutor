'use client';

import { useState } from 'react';

import { Button } from '@/app/components/button';
import { DiscoverCard, useDiscoverMeanings } from '@/app/vocab/discover-card';
import type { DiscoverCard as DiscoverWord } from './actions';

export function DiscoverWords({ words, onSkip, onFinish }: {
  words: DiscoverWord[];
  onSkip: (lemma: string) => void;
  onFinish: (added: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [added, setAdded] = useState(0);
  const { meanings, loading, error, retry } = useDiscoverMeanings(words);
  const word = words[index];

  function advance(wasAdded: boolean) {
    const nextAdded = added + Number(wasAdded);
    if (index === words.length - 1) onFinish(nextAdded);
    else {
      setAdded(nextAdded);
      setIndex((value) => value + 1);
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="discover-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="discover-heading" className="font-display text-2xl">Discover new words</h2>
        <Button variant="secondary" onClick={() => onFinish(added)}>Back to my words</Button>
      </div>
      <p className="text-ink-2 text-sm" role="status">Word {index + 1} of {words.length} · {added} added</p>
      <DiscoverCard key={word.lemma} word={word} meaning={meanings[word.lemma]} loading={loading}
        loadError={error} onRetry={() => void retry()}
        onSkip={(lemma) => { onSkip(lemma); advance(false); }} onAdded={() => advance(true)} skipLabel="Skip word" />
    </section>
  );
}
