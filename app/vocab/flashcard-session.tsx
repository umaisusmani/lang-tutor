'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/app/components/button';
import { Pill } from '@/app/components/pill';
import { gradeCardAction, type DiscoverCard as DiscoverWord, type SessionCard } from '@/app/vocab/actions';
import { DiscoverCard, useDiscoverMeanings } from '@/app/vocab/discover-card';
import type { ReviewSummary } from '@/lib/review-session';
import { formatInterval, Grades, previewIntervals, type Grade } from '@/lib/srs';

const BUTTONS = [
  { grade: Grades.Again, label: 'Again', help: 'I forgot' },
  { grade: Grades.Hard, label: 'Hard', help: 'I recalled it slowly' },
  { grade: Grades.Good, label: 'Good', help: 'I knew it' },
  { grade: Grades.Easy, label: 'Easy', help: 'I knew it instantly' },
];
const SENTENCE_KEY = 'starfinch_front_sentence';

type SessionItem = { kind: 'review'; card: SessionCard } | { kind: 'discover'; word: DiscoverWord };

function interleave(cards: SessionCard[], discover: DiscoverWord[]): SessionItem[] {
  const items: SessionItem[] = [];
  let nextDiscover = 0;
  cards.forEach((card, index) => {
    items.push({ kind: 'review', card });
    if ((index + 1) % 3 === 0 && nextDiscover < discover.length) {
      items.push({ kind: 'discover', word: discover[nextDiscover++] });
    }
  });
  for (; nextDiscover < discover.length; nextDiscover++) {
    items.push({ kind: 'discover', word: discover[nextDiscover] });
  }
  return items;
}

function readShowSentence() {
  try { return localStorage.getItem(SENTENCE_KEY) === '1'; } catch { return false; }
}

export function FlashcardSession({
  initialCards, discover, extra, onFinish, onReload, onKeepPractising, onSkip, keepingGoing = false,
}: {
  initialCards: SessionCard[];
  discover: DiscoverWord[];
  extra: boolean;
  onKeepPractising: () => void;
  keepingGoing?: boolean;
  onSkip: (lemma: string) => void;
  onFinish: (summary: ReviewSummary) => void;
  onReload: () => void;
}) {
  const [queue, setQueue] = useState<SessionItem[]>(() => interleave(initialCards, discover));
  const total = initialCards.length + discover.length;
  const { meanings, loading: meaningsLoading, error: meaningsError, retry } = useDiscoverMeanings(discover);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [dueComplete, setDueComplete] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [showSentence, setShowSentence] = useState(readShowSentence);
  const [summary, setSummary] = useState<ReviewSummary>({
    reviewed: 0, added: 0, scheduledLater: 0, nextReviewAt: null, complete: false,
  });
  const surfaceRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const startedAt = useRef(0);
  const current = queue[0];
  const completed = total - queue.length;

  useEffect(() => {
    startedAt.current = performance.now();
    surfaceRef.current?.focus();
  }, [current]);

  function advance(next: ReviewSummary) {
    setSummary(queue.length === 1 ? { ...next, complete: true } : next);
    if (queue.length === 1) {
      if (extra) onFinish({ ...next, complete: true });
      else {
        setQueue([]);
        setDueComplete(true);
      }
    } else setQueue((items) => items.slice(1));
  }

  function revealAnswer() {
    setShownAt(new Date());
    surfaceRef.current?.focus();
  }

  async function handleGrade(rating: Grade, gradedAt: number) {
    if (current?.kind !== 'review' || !shownAt || savingRef.current || needsReload) return;
    const card = current.card;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await gradeCardAction(card.id, rating, {
        surface: 'review_page',
        durationMs: gradedAt - startedAt.current,
        expectedReps: card.schedule.reps,
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
        ...summary,
        reviewed: summary.reviewed + 1,
        scheduledLater: summary.scheduledLater + Number(later),
        nextReviewAt: later && (!summary.nextReviewAt || result.next.due < summary.nextReviewAt)
          ? result.next.due : summary.nextReviewAt,
        complete: queue.length === 1,
      };
      setShownAt(null);
      advance(next);
    } catch {
      setError('We could not confirm that your review was saved. Try the rating again; it will not be saved twice.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!current && !dueComplete) return null;
  const card = current?.kind === 'review' ? current.card : null;
  const intervals = shownAt && card ? previewIntervals(card.schedule, shownAt) : null;
  const reverse = card?.direction === 'reverse';

  return (
    <div
      ref={surfaceRef}
      tabIndex={-1}
      aria-label="Vocabulary review"
      className="flex flex-col gap-5 outline-none"
      onKeyDown={(event) => {
        if (current?.kind !== 'review' || event.target !== event.currentTarget || event.repeat || saving || needsReload) return;
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
          <h2 className="font-display text-2xl">{extra ? 'Practice' : 'Vocabulary review'}</h2>
          <p className="text-ink-2 text-sm" role="status">
            {completed} of {total} cards · {queue.length} left
          </p>
          {extra && <p className="text-ink-2 text-sm">Practising ahead: nothing here is due yet.</p>}
        </div>
        {!dueComplete && <Button variant="secondary" type="button" disabled={saving} onClick={() => onFinish({ ...summary, complete: false })}>
          End review
        </Button>}
      </div>
      <div role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}
        className="border-line bg-panel h-3 w-full overflow-hidden rounded-full border-2">
        <div className={`bg-yellow h-full transition-[width] duration-300 ease-out ${completed > 0 ? 'border-line border-r-2' : ''}`}
          style={{ width: `${(completed / total) * 100}%` }} />
      </div>
      {dueComplete ? <div className="border-line bg-panel mx-auto flex w-full max-w-[600px] flex-col gap-4 rounded-2xl border-2 p-6 shadow-[3px_3px_0_var(--line)]" role="status">
        <h3 className="font-display text-3xl">All due words done.</h3>
        <p>{summary.reviewed} {summary.reviewed === 1 ? 'word' : 'words'} reviewed and saved.</p>
        {summary.added > 0 && <p>{summary.added} new {summary.added === 1 ? 'word' : 'words'} added.</p>}
        {summary.scheduledLater > 0 && <p className="text-ink-2 text-sm">
          {summary.scheduledLater} {summary.scheduledLater === 1 ? 'word is' : 'words are'} scheduled for another review.
          {summary.nextReviewAt && ` The next is ready at ${new Date(summary.nextReviewAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
        </p>}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={keepingGoing} onClick={onKeepPractising}>{keepingGoing ? 'Loading…' : 'Keep practising'}</Button>
          <Button variant="secondary" onClick={() => onFinish(summary)}>Back to my words</Button>
        </div>
      </div> : current?.kind === 'discover' ? <DiscoverCard key={current.word.lemma} word={current.word} meaning={meanings[current.word.lemma]}
        loading={meaningsLoading} loadError={meaningsError} onRetry={() => void retry()}
        onSkip={(lemma) => { onSkip(lemma); advance(summary); }}
        onAdded={() => advance({ ...summary, added: summary.added + 1 })} /> : (
      <div key={card?.id} className="border-line bg-panel mx-auto flex min-h-[300px] w-full max-w-[600px] animate-[fade-rise_180ms_ease-out] flex-col gap-6 rounded-2xl border-2 p-5 shadow-[3px_3px_0_var(--line)] sm:p-7">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-ink-3 text-sm">{reverse ? 'Recall the German word' : 'Recall the English meaning'}</p>
          <p className="font-display text-4xl leading-tight break-words">{reverse ? card?.translation : card?.lemma}</p>
          {!reverse && card?.exampleSentence && (
            <label className="text-ink-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={showSentence} onChange={(event) => {
                setShowSentence(event.target.checked);
                try { localStorage.setItem(SENTENCE_KEY, event.target.checked ? '1' : '0'); } catch {}
              }} />
              Show sentence hint
            </label>
          )}
          {!reverse && showSentence && <p className="text-ink-2 italic">{card?.exampleSentence}</p>}
          {shownAt && (
            <div className="border-hair flex w-full animate-[fade-rise_180ms_ease-out] flex-col gap-3 border-t-2 pt-5" role="status">
              <p className="text-2xl font-semibold">{reverse ? card?.lemma : card?.translation}</p>
              {card?.exampleSentence && (reverse || !showSentence) && (
                <p className="text-ink-2 italic">{card?.exampleSentence}</p>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="border-line bg-orange text-on-bright rounded-xl border-2 p-3" role="alert">
            <p>{error}</p>
            {needsReload && <Pill type="button" onClick={onReload} hitArea className="mt-2">Reload review</Pill>}
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
      </div>)}
    </div>
  );
}
