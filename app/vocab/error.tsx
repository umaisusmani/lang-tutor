'use client';

import { Button } from '@/app/components/button';

export default function VocabError({ reset }: { reset: () => void }) {
  return <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
    <h1 className="font-display text-3xl">Could not load your vocabulary</h1>
    <p>Your words are still saved. Please try again.</p>
    <Button variant="secondary" onClick={reset}>Try again</Button>
  </main>;
}
