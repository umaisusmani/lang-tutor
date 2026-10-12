'use client';

import { useEffect, useRef, useState } from 'react';

import { notifyError } from '@/app/components/toaster';
import { gradeCardAction, type SessionCard } from '@/app/vocab/actions';
import { formatInterval, Grades, previewIntervals, type Grade } from '@/lib/srs';

/** A card in the session queue. `availableAt` is when it may be shown: a card
 * that was just failed waits out its learning step (1m, then 10m) instead of
 * reappearing instantly. */
type QueueItem = SessionCard & { availableAt: number };

const LEARNING_STATES = [1, 3];

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
  onExit,
}: {
  initialCards: SessionCard[];
  onExit: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>(() => initialCards.map(toQueueItem));
  const [shownAt, setShownAt] = useState<Date | null>(null); // null = front side
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(0);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || saving) return;
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
              : `${reviewed} ${reviewed === 1 ? 'card' : 'cards'} reviewed. Cards come back right before you'd forget them.`}
        </p>
        <BackButton onExit={onExit} label="Back to word list" primary={!waiting} />
      </div>
    );
  }

  const intervals = shownAt ? previewIntervals(current.schedule, shownAt) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-ink-3 font-mono text-[11px]">
          {queue.length} {queue.length === 1 ? 'card' : 'cards'} left · {reviewed} done
        </span>
        <BackButton onExit={onExit} label="End session" />
      </div>

      <div className="border-line bg-panel mx-auto flex min-h-[260px] w-full max-w-[560px] flex-col justify-between gap-6 rounded-[14px] border-2 p-6 shadow-[3px_3px_0_var(--line)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-[30px] leading-tight font-extrabold break-words">{current.lemma}</p>

          {shownAt && (
            <div className="border-line flex w-full animate-[fade-rise_160ms_ease-out] flex-col items-center gap-2 border-t-2 border-dashed pt-4">
              <p className="text-[20px] font-semibold">
                {current.translation ?? 'no translation saved'}
              </p>
              {current.exampleSentence && (
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
