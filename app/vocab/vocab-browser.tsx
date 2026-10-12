'use client';

import { useState } from 'react';

import { notifyError } from '@/app/components/toaster';
import { startSessionAction, type SessionPayload } from '@/app/vocab/actions';
import { FlashcardSession } from '@/app/vocab/flashcard-session';
import { VocabGrid } from '@/app/vocab/vocab-grid';
import type { VocabEntry } from '@/lib/types/db';

const SKIPPED_KEY = 'starfinch_skipped_words';
const SKIPPED_MAX = 500;

/** Starter words the learner skipped. Kept in this browser, not the database:
 * it's a preference about what to be offered, and losing it only means a
 * skipped word can be offered again. */
function readSkipped(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rememberSkipped(lemma: string) {
  try {
    const next = [...readSkipped().filter((l) => l !== lemma), lemma].slice(-SKIPPED_MAX);
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the word may simply be offered again.
  }
}

/**
 * The /vocab page body: the word list, or -- after "Start session" -- a
 * flashcard session in its place. Two views of one page, so ending a session
 * lands back on the list without a navigation.
 */
export function VocabBrowser({ entries, dueCount }: { entries: VocabEntry[]; dueCount: number }) {
  const [cards, setCards] = useState<SessionPayload | null>(null);
  const [starting, setStarting] = useState(false);
  // Bumped per load so a new session never inherits the last one's state.
  const [round, setRound] = useState(0);

  async function start(mode: 'due' | 'practice' = 'due') {
    setStarting(true);
    try {
      const loaded = await startSessionAction(mode, readSkipped());
      if (loaded) {
        setCards(loaded);
        setRound((n) => n + 1);
      }
      else notifyError("Couldn't start a session. Try again.", 'session-start');
    } catch {
      notifyError("Couldn't start a session. Try again.", 'session-start');
    } finally {
      setStarting(false);
    }
  }

  if (cards) {
    return (
      <FlashcardSession
        key={round}
        initialCards={cards.cards}
        initialDiscover={cards.discover}
        onExit={() => setCards(null)}
        onPracticeMore={() => void start('practice')}
        onSkipWord={rememberSkipped}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void start('due')}
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
