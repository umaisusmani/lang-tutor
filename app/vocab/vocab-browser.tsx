'use client';

import { useState } from 'react';

import { notifyError } from '@/app/components/toaster';
import { startSessionAction, type SessionCard } from '@/app/vocab/actions';
import { FlashcardSession } from '@/app/vocab/flashcard-session';
import { VocabGrid } from '@/app/vocab/vocab-grid';
import type { VocabEntry } from '@/lib/types/db';

/**
 * The /vocab page body: the word list, or -- after "Start session" -- a
 * flashcard session in its place. Two views of one page, so ending a session
 * lands back on the list without a navigation.
 */
export function VocabBrowser({ entries, dueCount }: { entries: VocabEntry[]; dueCount: number }) {
  const [cards, setCards] = useState<SessionCard[] | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const loaded = await startSessionAction();
      if (loaded) setCards(loaded);
      else notifyError("Couldn't start a session. Try again.", 'session-start');
    } catch {
      notifyError("Couldn't start a session. Try again.", 'session-start');
    } finally {
      setStarting(false);
    }
  }

  if (cards) {
    // Re-keyed per start so a new session never inherits the last one's state.
    return <FlashcardSession initialCards={cards} onExit={() => setCards(null)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting}
          className="border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-4 py-2 text-[14px] font-bold shadow-[3px_3px_0_var(--line)] active:translate-x-px active:translate-y-px disabled:cursor-wait disabled:opacity-60"
        >
          {starting ? 'Loading…' : 'Start session'}
        </button>
        <span className="text-ink-3 font-mono text-[11px]">
          {dueCount > 0 ? `${dueCount} due` : 'nothing due right now'}
        </span>
      </div>
      <VocabGrid entries={entries} />
    </div>
  );
}
