'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/app/components/button';
import { gradeCardAction, type SessionCard } from '@/app/vocab/actions';
import type { ReviewSummary } from '@/lib/review-session';
import { formatInterval, Grades, previewIntervals, type Grade } from '@/lib/srs';

const BUTTONS = [
  { grade: Grades.Again, label: 'Again', help: 'I forgot' },
  { grade: Grades.Hard, label: 'Hard', help: 'I recalled it slowly' },
  { grade: Grades.Good, label: 'Good', help: 'I knew it' },
  { grade: Grades.Easy, label: 'Easy', help: 'I knew it instantly' },
];
const SENTENCE_KEY = 'starfinch_front_sentence';

function readShowSentence() {
  try { return localStorage.getItem(SENTENCE_KEY) === '1'; } catch { return false; }
}

export function FlashcardSession({
  initialCards, extra, onFinish, onReload,
}: {
  initialCards: SessionCard[];
  extra: boolean;
  onFinish: (summary: ReviewSummary) => void;
  onReload: () => void;
}) {
  const [queue, setQueue] = useState(initialCards);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [showSentence, setShowSentence] = useState(readShowSentence);
  const [summary, setSummary] = useState<ReviewSummary>({
    reviewed: 0, scheduledLater: 0, nextReviewAt: null, complete: false,
  });
  const surfaceRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const startedAt = useRef(0);
  const current = queue[0];

  useEffect(() => {
    startedAt.current = performance.now();
    surfaceRef.current?.focus();
  }, [current?.id]);

  function revealAnswer() {
    setShownAt(new Date());
    surfaceRef.current?.focus();
  }

  async function handleGrade(rating: Grade, gradedAt: number) {
    if (!current || !shownAt || savingRef.current || needsReload) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await gradeCardAction(current.id, rating, {
        surface: 'review_page',
        durationMs: gradedAt - startedAt.current,
        expectedReps: current.schedule.reps,
      });
      if (result.status !== 'ok') {
        const changed = result.status === 'stale' || result.status === 'not_found';
        setNeedsReload(changed);
        setError(changed
          ? 'This card changed in another tab or its review was already saved. Reload your review to continue.'
          : result.status === 'unauthenticated'
            ? 'Your session expired. Sign in again to save this review.'
            : 'Your review was not saved. Choose your rating again to retry.');
        return;
      }
      const later = result.next.state === 1 || result.next.state === 3;
      const next = {
        reviewed: summary.reviewed + 1,
        scheduledLater: summary.scheduledLater + Number(later),
        nextReviewAt: later && (!summary.nextReviewAt || result.next.due < summary.nextReviewAt)
          ? result.next.due : summary.nextReviewAt,
        complete: queue.length === 1,
      };
      setSummary(next);
      setShownAt(null);
      if (next.complete) onFinish(next);
      else setQueue((cards) => cards.slice(1));
    } catch {
      setError('We could not confirm that your review was saved. Try the rating again; it will not be saved twice.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!current) return null;
  const intervals = shownAt ? previewIntervals(current.schedule, shownAt) : null;
  const reverse = current.direction === 'reverse';

  return (
    <div
      ref={surfaceRef}
      tabIndex={-1}
      aria-label="Vocabulary review"
      className="flex flex-col gap-5 outline-none"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.repeat || saving || needsReload) return;
        if (!shownAt && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault();
          revealAnswer();
        } else if (shownAt && /^[1-4]$/.test(event.key)) {
          event.preventDefault();
          void handleGrade(Number(event.key) as Grade, event.timeStamp);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{extra ? 'Extra practice' : 'Vocabulary review'}</h2>
          <p className="text-ink-2 text-sm" role="status">
            {summary.reviewed} of {initialCards.length} words reviewed · {queue.length} left
          </p>
        </div>
        <Button variant="secondary" type="button" disabled={saving} onClick={() => onFinish({ ...summary, complete: false })}>
          End review
        </Button>
      </div>
      <progress aria-label="Review progress" value={summary.reviewed} max={initialCards.length}
        className="h-2 w-full accent-[var(--accent)]" />
      <div className="border-line bg-panel mx-auto flex min-h-[300px] w-full max-w-[600px] flex-col gap-6 rounded-2xl border-2 p-5 shadow-[3px_3px_0_var(--line)] sm:p-7">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-ink-3 text-sm">{reverse ? 'Recall the German word' : 'Recall the English meaning'}</p>
          <p className="font-display text-4xl leading-tight break-words">{reverse ? current.translation : current.lemma}</p>
          {!reverse && current.exampleSentence && (
            <label className="text-ink-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showSentence} onChange={(event) => {
                setShowSentence(event.target.checked);
                try { localStorage.setItem(SENTENCE_KEY, event.target.checked ? '1' : '0'); } catch {}
              }} />
              Show sentence hint
            </label>
          )}
          {!reverse && showSentence && <p className="text-ink-2 italic">{current.exampleSentence}</p>}
          {shownAt && (
            <div className="border-hair flex w-full flex-col gap-3 border-t-2 pt-5" role="status">
              <p className="text-2xl font-semibold">{reverse ? current.lemma : current.translation}</p>
              {current.exampleSentence && (reverse || !showSentence) && (
                <p className="text-ink-2 italic">{current.exampleSentence}</p>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="border-line bg-orange text-on-bright rounded-xl border-2 p-3" role="alert">
            <p>{error}</p>
            {needsReload && <button type="button" onClick={onReload} className="mt-2 font-bold underline">Reload review</button>}
          </div>
        )}
        {!shownAt ? (
          <Button variant="primary" size="lg" type="button" onClick={revealAnswer}>
            Show answer
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-ink-2 text-center text-sm">Forgot it? Choose Again. Hard means you remembered, with effort.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUTTONS.map(({ grade: rating, label, help }) => (
                <button key={rating} type="button" disabled={saving || needsReload}
                  onClick={(event) => void handleGrade(rating, event.timeStamp)}
                  className={`border-line flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 disabled:opacity-50 ${rating === Grades.Good ? 'bg-yellow text-on-bright shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)]' : 'bg-panel hover:bg-soft cursor-pointer'}`}>
                  <span className="font-bold">{label}</span>
                  <span className="text-xs">{help}</span>
                  <span className="text-sm">{intervals && shownAt && formatInterval(shownAt, intervals[rating])}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-ink-3 text-center text-xs" role="status">
          {saving ? 'Saving review…' : 'Shortcuts: focus the review area, then Space to reveal or 1–4 to rate.'}
        </p>
      </div>
    </div>
  );
}
