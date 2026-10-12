'use client';

import { useEffect, useRef, useState } from 'react';

import { notifyError } from '@/app/components/toaster';
import {
  addStarterWordAction,
  gradeCardAction,
  type DiscoverCard,
  type SessionCard,
} from '@/app/vocab/actions';
import { formatInterval, Grades, previewIntervals, type Grade } from '@/lib/srs';

/** A card in the session queue. `availableAt` is when it may be shown: a card
 * that was just failed waits out its learning step (1m, then 10m) instead of
 * reappearing instantly. */
type QueueItem = SessionCard & { availableAt: number };

const LEARNING_STATES = [1, 3];

const SENTENCE_KEY = 'starfinch_front_sentence';

function readShowSentence(): boolean {
  try {
    return localStorage.getItem(SENTENCE_KEY) === '1';
  } catch {
    return false;
  }
}

/** A new word is offered after this many reviewed cards (and whenever the
 * queue is empty or only waiting out learning steps). */
const DISCOVER_EVERY = 4;

const BUTTONS: { grade: Grade; label: string }[] = [
  { grade: Grades.Again, label: 'Again' },
  { grade: Grades.Hard, label: 'Hard' },
  { grade: Grades.Good, label: 'Good' },
  { grade: Grades.Easy, label: 'Easy' },
];

function toQueueItem(card: SessionCard): QueueItem {
  const waiting = LEARNING_STATES.includes(card.schedule.state);
  return { ...card, availableAt: waiting ? new Date(card.schedule.due).getTime() : 0 };
}

/**
 * An Anki-style session: the German word shows, you recall the meaning, press
 * Show answer, then rate how it went. Each button shows when the card would
 * come back. The scheduling itself is FSRS (lib/srs.ts); this only runs the
 * loop and keeps failed cards in the queue until their learning step passes.
 *
 * Space/Enter shows the answer; 1-4 grade (Again, Hard, Good, Easy).
 */
export function FlashcardSession({
  initialCards,
  initialDiscover = [],
  extra = false,
  onExit,
  onPracticeMore,
  onSkipWord,
}: {
  initialCards: SessionCard[];
  /** New words from the starter list, offered with Add / Skip. */
  initialDiscover?: DiscoverCard[];
  /** These cards aren't due yet: extra practice rather than scheduled reviews. */
  extra?: boolean;
  onExit: () => void;
  /** Starts a round of extra cards that aren't due yet. Hidden when absent. */
  onPracticeMore?: () => void;
  /** Called when a new word is skipped, so it can be remembered. */
  onSkipWord?: (lemma: string) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>(() => initialCards.map(toQueueItem));
  const [shownAt, setShownAt] = useState<Date | null>(null); // null = front side
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [discover, setDiscover] = useState<DiscoverCard[]>(initialDiscover);
  const [sinceDiscover, setSinceDiscover] = useState(0);
  const [added, setAdded] = useState(0);
  // Whether a German -> English card also shows the sentence on its front.
  // Context helps with gender and usage, but gives the word away less cleanly,
  // so it's the learner's choice; remembered per browser.
  const [showSentence, setShowSentence] = useState(readShowSentence);
  // Ticks once a second only while every remaining card is waiting out a
  // learning step, so the countdown and the moment a card returns stay current.
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(0);

  const current = queue.find((c) => c.availableAt <= now) ?? null;
  const waitingUntil =
    !current && queue.length > 0 ? Math.min(...queue.map((c) => c.availableAt)) : null;

  useEffect(() => {
    if (current || waitingUntil === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [current, waitingUntil]);

  // Each card starts the clock over. (grade() already flips back to the front.)
  const currentId = current?.id;
  useEffect(() => {
    startedAt.current = Date.now();
  }, [currentId]);

  async function grade(rating: Grade) {
    if (!current || !shownAt || saving) return;
    const card = current;
    setSaving(true);

    let result: Awaited<ReturnType<typeof gradeCardAction>> | null = null;
    try {
      result = await gradeCardAction(card.id, rating, {
        surface: 'review_page',
        durationMs: Date.now() - startedAt.current,
      });
    } catch {
      // result stays null: handled with the other failures below.
    }

    setSaving(false);
    setShownAt(null);
    setNow(Date.now());

    if (result?.status === 'ok') {
      setReviewed((n) => n + 1);
      setSinceDiscover((n) => n + 1);
      const { next } = result;
      setQueue((q) => {
        const rest = q.filter((c) => c.id !== card.id);
        // Failed or still in learning: it comes back this session, on the
        // schedule the server just set. Graduated cards leave until their date.
        return LEARNING_STATES.includes(next.state)
          ? [...rest, toQueueItem({ ...card, schedule: next })]
          : rest;
      });
      return;
    }

    // Whatever went wrong, don't leave the learner stuck on this card.
    setQueue((q) => q.filter((c) => c.id !== card.id));
    if (result?.status === 'stale') {
      notifyError('That card was already reviewed in another tab.', 'review-stale');
    } else {
      notifyError("Couldn't save that review. It will come back next time.", 'review-error');
    }
  }

  // A new word takes over the card slot every few reviews, or whenever there's
  // nothing else to show (queue empty, or only cards waiting out a step).
  const discoverCard =
    discover.length > 0 && (sinceDiscover >= DISCOVER_EVERY || !current) ? discover[0] : null;

  async function resolveDiscover(add: boolean) {
    if (!discoverCard || saving) return;
    const word = discoverCard;
    setSaving(true);
    let ok = true;
    if (add) {
      try {
        ok = (await addStarterWordAction(word.lemma)).ok;
      } catch {
        ok = false;
      }
    }
    setSaving(false);
    if (add && !ok) {
      notifyError("Couldn't add that word. Try again.", 'discover-add');
      return;
    }
    if (add) setAdded((n) => n + 1);
    else onSkipWord?.(word.lemma);
    setShownAt(null);
    setSinceDiscover(0);
    setDiscover((d) => d.filter((x) => x.lemma !== word.lemma));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (saving) return;
      if (discoverCard) {
        if (!shownAt) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setShownAt(new Date());
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          void resolveDiscover(true);
        } else if (e.key.toLowerCase() === 's') {
          void resolveDiscover(false);
        }
        return;
      }
      if (!current) return;
      if (!shownAt) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setShownAt(new Date());
        }
        return;
      }
      const key = Number(e.key);
      if (key >= 1 && key <= 4) void grade(key as Grade);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (discoverCard) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-ink-3 font-mono text-[11px]">
            {queue.length} {queue.length === 1 ? 'card' : 'cards'} left · {reviewed} done
          </span>
          <BackButton onExit={onExit} label="End session" />
        </div>

        <div className="border-line bg-panel mx-auto flex min-h-[260px] w-full max-w-[560px] flex-col justify-between gap-6 rounded-[14px] border-2 border-dashed p-6 shadow-[3px_3px_0_var(--line)]">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <span className="bg-soft text-ink-2 rounded-full px-2.5 py-0.5 font-mono text-[10px]">
              new word · not in your vocab yet
            </span>
            <p className="text-[30px] leading-tight font-extrabold break-words">
              {discoverCard.lemma}
            </p>
            {shownAt && (
              <div className="border-line flex w-full animate-[fade-rise_160ms_ease-out] flex-col items-center gap-2 border-t-2 border-dashed pt-4">
                <p className="text-[18px] font-semibold">{discoverCard.example}</p>
                <p className="text-ink-2 text-[14px] italic">{discoverCard.exampleTranslation}</p>
              </div>
            )}
          </div>

          {!shownAt ? (
            <button
              type="button"
              onClick={() => setShownAt(new Date())}
              className="border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-4 py-2.5 text-[15px] font-bold active:translate-x-px active:translate-y-px"
            >
              Show example{' '}
              <span className="font-mono text-[10px] font-normal opacity-70">space</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void resolveDiscover(false)}
                className="border-line bg-panel hover:bg-yellow hover:text-on-bright cursor-pointer rounded-lg border-2 px-3 py-2 text-[14px] font-bold disabled:cursor-wait disabled:opacity-50"
              >
                Skip <span className="text-ink-3 font-mono text-[10px] font-normal">s</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resolveDiscover(true)}
                className="border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-3 py-2 text-[14px] font-bold disabled:cursor-wait disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add to my vocab'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!current) {
    const waiting = waitingUntil !== null;
    const seconds = waiting ? Math.max(0, Math.ceil((waitingUntil - now) / 1000)) : 0;
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <h2 className="text-[26px] leading-[1.05] font-extrabold tracking-[-0.02em]">
          {waiting
            ? 'Next card in a moment'
            : initialCards.length === 0
              ? 'Nothing due'
              : 'All caught up'}
        </h2>
        <p className="text-ink-2 text-[15px] leading-relaxed">
          {waiting
            ? `A card you just failed comes back in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`
            : initialCards.length === 0
              ? 'No cards are due right now. Save more words from the chat, or come back later.'
              : `${reviewed} ${reviewed === 1 ? 'card' : 'cards'} reviewed${added > 0 ? `, ${added} new ${added === 1 ? 'word' : 'words'} added` : ''}. Cards come back right before you'd forget them.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {!waiting && onPracticeMore && (
            <BackButton onExit={onPracticeMore} label="Practice 10 more" primary />
          )}
          <BackButton onExit={onExit} label="Back to word list" />
        </div>
      </div>
    );
  }

  const intervals = shownAt ? previewIntervals(current.schedule, shownAt) : null;
  const reverse = current.direction === 'reverse';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-ink-3 font-mono text-[11px]">
          {queue.length} {queue.length === 1 ? 'card' : 'cards'} left · {reviewed} done
          {extra && ' · extra practice, not due yet'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showSentence}
            onClick={() => {
              const next = !showSentence;
              setShowSentence(next);
              try {
                localStorage.setItem(SENTENCE_KEY, next ? '1' : '0');
              } catch {
                // Not remembered; still applies for this session.
              }
            }}
            className="border-line text-ink-2 hover:bg-yellow hover:text-on-bright cursor-pointer rounded-full border-2 px-3 py-1 font-mono text-[11px] transition-colors duration-150"
          >
            sentence: {showSentence ? 'on' : 'off'}
          </button>
          <BackButton onExit={onExit} label="End session" />
        </div>
      </div>

      <div className="border-line bg-panel mx-auto flex min-h-[260px] w-full max-w-[560px] flex-col justify-between gap-6 rounded-[14px] border-2 p-6 shadow-[3px_3px_0_var(--line)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {reverse ? (
            <>
              <span className="text-ink-3 font-mono text-[10px]">say it in German</span>
              <p className="text-[30px] leading-tight font-extrabold break-words">
                {current.translation}
              </p>
            </>
          ) : (
            <>
              <p className="text-[30px] leading-tight font-extrabold break-words">{current.lemma}</p>
              {showSentence && current.exampleSentence && (
                <p className="text-ink-2 text-[14px] italic">{current.exampleSentence}</p>
              )}
            </>
          )}

          {shownAt && (
            <div className="border-line flex w-full animate-[fade-rise_160ms_ease-out] flex-col items-center gap-2 border-t-2 border-dashed pt-4">
              <p className="text-[20px] font-semibold">
                {reverse ? current.lemma : (current.translation ?? 'no translation saved')}
              </p>
              {current.exampleSentence && (reverse || !showSentence) && (
                <p className="text-ink-2 text-[14px] italic">{current.exampleSentence}</p>
              )}
            </div>
          )}
        </div>

        {!shownAt ? (
          <button
            type="button"
            onClick={() => setShownAt(new Date())}
            className="border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-4 py-2.5 text-[15px] font-bold active:translate-x-px active:translate-y-px"
          >
            Show answer <span className="font-mono text-[10px] font-normal opacity-70">space</span>
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {BUTTONS.map(({ grade: g, label }) => (
              <button
                key={g}
                type="button"
                disabled={saving}
                onClick={() => void grade(g)}
                className={`border-line flex cursor-pointer flex-col items-center rounded-lg border-2 px-2 py-2 text-[14px] font-bold transition-colors duration-150 active:translate-x-px active:translate-y-px disabled:cursor-wait disabled:opacity-50 ${
                  g === Grades.Good ? 'bg-yellow text-on-bright' : 'bg-panel hover:bg-yellow hover:text-on-bright'
                }`}
              >
                <span>
                  {label}{' '}
                  <span className="text-ink-3 font-mono text-[10px] font-normal">{g}</span>
                </span>
                <span className="font-mono text-[11px] font-normal opacity-70">
                  {intervals && shownAt ? formatInterval(shownAt, intervals[g]) : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackButton({
  onExit,
  label,
  primary = false,
}: {
  onExit: () => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onExit}
      className={
        primary
          ? 'border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-4 py-2 text-[14px] font-bold'
          : 'border-line text-ink-2 hover:bg-yellow hover:text-on-bright cursor-pointer rounded-full border-2 px-3 py-1 font-mono text-[11px] transition-colors duration-150'
      }
    >
      {label}
    </button>
  );
}
