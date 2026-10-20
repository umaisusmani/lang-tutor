'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { notifyError } from '@/app/components/toaster';
import { discoverWordsAction, startSessionAction, type DiscoverCard, type SessionPayload } from '@/app/vocab/actions';
import { FlashcardSession } from '@/app/vocab/flashcard-session';
import { DiscoverWords } from '@/app/vocab/discover-words';
import type { ReviewSummary } from '@/lib/review-session';
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
export function VocabBrowser({
  entries,
  dueCount,
  heading,
  dueWordIds,
}: {
  entries: VocabEntry[];
  dueCount: number;
  dueWordIds: string[];
  /** The page title block, rendered here so it can share a row with the
   * start button (the page itself is a Server Component and can't see
   * `starting`). */
  heading: ReactNode;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<SessionPayload | null>(null);
  const [discovery, setDiscovery] = useState<DiscoverCard[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [round, setRound] = useState(0);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false);

  useEffect(() => { noticeRef.current?.focus(); }, [summary, notice]);

  async function start(mode: 'due' | 'practice') {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const loaded = await startSessionAction(mode);
      if (!loaded) throw new Error('Session unavailable');
      setSummary(null);
      if (loaded.cards.length === 0) {
        setCards(null);
        setNotice(mode === 'due'
          ? 'No words are ready for review right now. You’re all caught up for this round.'
          : 'No extra words are available right now. Words reviewed today are saved for later.');
        router.refresh();
      } else {
        setNotice('');
        setCards(loaded);
        setRound((n) => n + 1);
      }
    } catch {
      notifyError("Couldn't load your review. Please try again.", 'session-start');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function discover() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const words = await discoverWordsAction(readSkipped());
      if (words.length) setDiscovery(words);
      else setNotice('No new words to suggest at your level right now.');
    } catch {
      notifyError("Couldn't load new words. Please try again.", 'discover-load');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  if (cards) {
    return <FlashcardSession key={round} initialCards={cards.cards} extra={cards.extra}
      onReload={() => void start(cards.extra ? 'practice' : 'due')}
      onFinish={(result) => {
        setCards(null);
        setSummary(result);
        setNotice('');
        router.refresh();
      }} />;
  }
  if (discovery) {
    return <DiscoverWords words={discovery} onSkip={rememberSkipped} onFinish={(added) => {
      setDiscovery(null);
      setSummary(null);
      setNotice(added ? `${added} new ${added === 1 ? 'word' : 'words'} added to your vocabulary.` : 'Back to your vocabulary.');
      router.refresh();
    }} />;
  }

  return (
    <>
      {heading}
      {(summary || notice) && (
        <div ref={noticeRef} tabIndex={-1} role="status"
          className="border-line bg-yellow text-on-bright rounded-2xl border-2 p-5 outline-none">
          {summary ? <>
            <h2 className="font-display text-2xl">{summary.complete ? 'Review complete' : 'Review ended'}</h2>
            <p className="mt-1">{summary.reviewed} {summary.reviewed === 1 ? 'word' : 'words'} reviewed and saved.</p>
            {summary.scheduledLater > 0 && <p className="mt-1 text-sm">
              {summary.scheduledLater} {summary.scheduledLater === 1 ? 'word is' : 'words are'} scheduled for another review.
              {summary.nextReviewAt && ` The next is ready at ${new Date(summary.nextReviewAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
            </p>}
          </> : <p>{notice}</p>}
        </div>
      )}
      {entries.length === 0 ? (
        <div className="border-hair bg-panel flex flex-col items-start gap-3 rounded-2xl border-2 p-6">
          <h2 className="font-display text-2xl">Your vocabulary starts with one word</h2>
          <p className="text-ink-2">In a chat, tap a German word and choose + to save it here for review.</p>
          <Link href="/?c=new" className="border-line rounded-full border-2 px-4 py-2 font-semibold">Start a chat →</Link>
        </div>
      ) : (
        <>
          <div className="border-hair bg-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 p-4">
            <div>
              <p className="font-semibold">{dueCount ? `${dueCount} ${dueCount === 1 ? 'word' : 'words'} ready to review` : 'No words ready right now'}</p>
              <p className="text-ink-2 mt-1 max-w-[48ch] text-sm">One direction per word in each round. The other direction waits until another day.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={starting || dueCount === 0} onClick={() => void start('due')}
                className="border-line bg-yellow text-on-bright rounded-full border-2 px-4 py-2 font-semibold disabled:opacity-50">
                {starting ? 'Loading…' : 'Review due words'}
              </button>
              <button type="button" disabled={starting} onClick={() => void start('practice')}
                className="border-line rounded-full border-2 px-4 py-2 text-sm disabled:opacity-50">Extra practice</button>
              <button type="button" disabled={starting} onClick={() => void discover()}
                className="border-line rounded-full border-2 px-4 py-2 text-sm disabled:opacity-50">Discover words</button>
            </div>
          </div>
          <VocabGrid entries={entries} dueWordIds={dueWordIds} />
        </>
      )}
    </>
  );
}
