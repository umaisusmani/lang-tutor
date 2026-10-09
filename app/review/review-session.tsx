'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { notifyError } from '@/app/components/toaster';
import { gradeCardAction } from '@/app/review/actions';
import { checkAnswer, type AnswerCheck, type VocabPrompt } from '@/lib/cloze';
import { formatInterval, Grades, previewIntervals, type Grade } from '@/lib/srs';
import type { CardSchedule } from '@/lib/types/db';

export type SessionCard = {
  id: string;
  prompt: VocabPrompt;
  exampleSentence: string | null;
  schedule: CardSchedule;
};

/** A card in the session queue. `availableAt` is when it may be shown: a card
 * that was just failed waits out its learning step (1m, then 10m) instead of
 * reappearing instantly. */
type QueueItem = SessionCard & { availableAt: number };

type Phase =
  | { name: 'answering' }
  | { name: 'revealed'; given: string; check: AnswerCheck; shownAt: Date }
  | { name: 'saving' };

const LEARNING_STATES = [1, 3];

const GRADE_LABELS: [Grade, string][] = [
  [Grades.Again, 'Again'],
  [Grades.Hard, 'Hard'],
  [Grades.Good, 'Good'],
  [Grades.Easy, 'Easy'],
];

function toQueueItem(card: SessionCard): QueueItem {
  const waiting = LEARNING_STATES.includes(card.schedule.state);
  return { ...card, availableAt: waiting ? new Date(card.schedule.due).getTime() : 0 };
}

/**
 * One review session: type the answer, see whether it was right, then pick how
 * hard it felt. Each button shows when the card would come back.
 *
 * Grading rules (plans/flashcards.md §6.3): a correct answer offers Hard /
 * Good / Easy with Good preselected; a wrong one offers Again, plus "I was
 * right" for typos and synonyms. Hard is a passing grade in FSRS, so it is
 * never offered after a wrong answer -- pressing it for a forgotten card
 * inflates that card's intervals.
 */
export function ReviewSession({ initialCards }: { initialCards: SessionCard[] }) {
  const [queue, setQueue] = useState<QueueItem[]>(() => initialCards.map(toQueueItem));
  const [phase, setPhase] = useState<Phase>({ name: 'answering' });
  const [answer, setAnswer] = useState('');
  const [reviewed, setReviewed] = useState(0);
  // Re-renders once a second while only waiting cards are left, so the
  // countdown and the moment a card becomes available both stay current.
  const [now, setNow] = useState(() => Date.now());
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = queue.find((c) => c.availableAt <= now) ?? null;
  const waitingUntil = current
    ? null
    : queue.length > 0
      ? Math.min(...queue.map((c) => c.availableAt))
      : null;

  useEffect(() => {
    if (current || waitingUntil === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [current, waitingUntil]);

  // Every card starts the clock over, and puts the cursor in the box.
  const currentId = current?.id;
  useEffect(() => {
    startedAt.current = Date.now();
    inputRef.current?.focus();
  }, [currentId]);

  function submitAnswer() {
    if (!current || phase.name !== 'answering') return;
    const check = checkAnswer(answer, current.prompt.answer);
    setPhase({ name: 'revealed', given: answer, check, shownAt: new Date() });
  }

  async function grade(rating: Grade) {
    if (!current || phase.name !== 'revealed') return;
    const card = current;
    const given = phase.given;
    setPhase({ name: 'saving' });

    let result: Awaited<ReturnType<typeof gradeCardAction>> | null = null;
    try {
      result = await gradeCardAction(card.id, rating, {
        surface: 'review_page',
        durationMs: Date.now() - startedAt.current,
        answerGiven: given,
      });
    } catch {
      // result stays null: handled with the other failures below.
    }

    setAnswer('');
    setPhase({ name: 'answering' });
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

  // Enter checks and, once revealed, takes the suggested grade; 1-4 pick a
  // button. Ignored while a request is in flight.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || phase.name !== 'revealed') return;
      const wrong = !phase.check.correct;
      const allowed: Grade[] = wrong ? [Grades.Again, Grades.Good] : [Grades.Hard, Grades.Good, Grades.Easy];
      const key = Number(e.key);
      if (e.key === 'Enter') {
        e.preventDefault();
        void grade(wrong ? Grades.Again : Grades.Good);
      } else if (key >= 1 && key <= 4 && allowed.includes(key as Grade)) {
        void grade(key as Grade);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (initialCards.length === 0 && reviewed === 0) {
    return (
      <Done
        title="Nothing to review yet"
        body="Words you save from the chat become cards here. Save a few, then come back."
        action={{ href: '/', label: 'Go to chat' }}
      />
    );
  }

  if (!current) {
    if (waitingUntil !== null) {
      const seconds = Math.max(0, Math.ceil((waitingUntil - now) / 1000));
      return (
        <Done
          title="Next card in a moment"
          body={`A card you just practised comes back in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`}
        />
      );
    }
    return (
      <Done
        title="All caught up"
        body={`${reviewed} ${reviewed === 1 ? 'card' : 'cards'} reviewed. Cards come back right before you'd forget them.`}
        action={{ href: '/', label: 'Back to chat' }}
      />
    );
  }

  const { prompt } = current;
  const revealed = phase.name !== 'answering';
  const result = phase.name === 'revealed' ? phase.check : null;
  const shownAt = phase.name === 'revealed' ? phase.shownAt : null;
  const intervals = shownAt ? previewIntervals(current.schedule, shownAt) : null;
  const hintFor = (g: Grade) => (shownAt && intervals ? formatInterval(shownAt, intervals[g]) : '');
  const left = queue.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">Wiederholen</h1>
        <span className="text-ink-3 font-mono text-[11px]">
          {left} {left === 1 ? 'card' : 'cards'} left · {reviewed} done
        </span>
      </div>

      <div className="border-line bg-panel flex flex-col gap-5 rounded-[14px] border-2 p-6 shadow-[3px_3px_0_var(--line)]">
        {prompt.kind === 'cloze' ? (
          <p className="text-[20px] leading-relaxed font-semibold">
            {prompt.segments.map((s, i) =>
              s.blank ? (
                <span
                  key={i}
                  className={`mx-0.5 inline-block min-w-[3.5em] border-b-2 px-1 text-center ${
                    revealed ? 'border-accent-ink' : 'border-line'
                  }`}
                >
                  {revealed ? s.text : ' '}
                </span>
              ) : s.emphasis ? (
                <strong key={i} className="font-extrabold underline decoration-2 underline-offset-4">
                  {s.text}
                </strong>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        ) : (
          <p className="text-[20px] leading-relaxed font-semibold">{prompt.translation}</p>
        )}

        <div className="text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]">
          {prompt.kind === 'cloze' && prompt.translation && <span>{prompt.translation}</span>}
          {prompt.kind === 'cloze' && prompt.lemma && <span>· {prompt.lemma}</span>}
          {prompt.kind === 'recall' && <span>in German, with its article</span>}
        </div>

        {!revealed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitAnswer();
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="Your answer"
              placeholder="Type the missing word"
              className="border-line bg-paper placeholder:text-ink-3 min-w-0 flex-1 rounded-lg border-2 px-3 py-2 text-[16px] outline-none focus:shadow-[3px_3px_0_var(--line)]"
            />
            <button
              type="submit"
              className="border-line bg-yellow text-on-bright cursor-pointer rounded-lg border-2 px-4 py-2 text-[14px] font-bold active:translate-x-px active:translate-y-px"
            >
              Check
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className={`rounded-lg px-3 py-2 text-[14px] ${
                result?.correct ? 'bg-soft' : 'bg-orange text-on-bright'
              }`}
              role="status"
            >
              {result?.correct ? (
                <>
                  <strong>Richtig.</strong>
                  {result.capitalization && (
                    <span className="text-ink-2"> Nouns are capitalized: {prompt.answer}</span>
                  )}
                </>
              ) : (
                <>
                  <strong>Not quite.</strong> The answer is <strong>{prompt.answer}</strong>
                  {phase.name === 'revealed' && phase.given.trim() && (
                    <span> — you wrote &ldquo;{phase.given.trim()}&rdquo;</span>
                  )}
                </>
              )}
            </div>

            {current.exampleSentence && prompt.kind === 'recall' && (
              <p className="text-ink-2 text-[14px] italic">{current.exampleSentence}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {GRADE_LABELS.filter(([g]) =>
                result?.correct
                  ? g === Grades.Hard || g === Grades.Good || g === Grades.Easy
                  : g === Grades.Again,
              ).map(([g, label]) => {
                const suggested = result?.correct ? g === Grades.Good : g === Grades.Again;
                return (
                  <GradeButton
                    key={g}
                    label={label}
                    hint={hintFor(g)}
                    shortcut={g}
                    primary={suggested}
                    disabled={phase.name === 'saving'}
                    onClick={() => void grade(g)}
                  />
                );
              })}
              {result && !result.correct && (
                <GradeButton
                  label="I was right"
                  hint={hintFor(Grades.Good)}
                  shortcut={Grades.Good}
                  disabled={phase.name === 'saving'}
                  onClick={() => void grade(Grades.Good)}
                />
              )}
            </div>
            <span className="text-ink-3 font-mono text-[10px]">
              Enter takes the highlighted button · keys 1–4 pick one
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeButton({
  label,
  hint,
  shortcut,
  primary = false,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  shortcut: number;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`border-line flex cursor-pointer flex-col items-center rounded-lg border-2 px-4 py-2 text-[14px] font-bold transition-colors duration-150 active:translate-x-px active:translate-y-px disabled:cursor-wait disabled:opacity-50 ${
        primary ? 'bg-yellow text-on-bright' : 'bg-panel hover:bg-yellow hover:text-on-bright'
      }`}
    >
      <span>
        {label} <span className="text-ink-3 font-mono text-[10px] font-normal">{shortcut}</span>
      </span>
      {hint && <span className="font-mono text-[11px] font-normal opacity-70">{hint}</span>}
    </button>
  );
}

function Done({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <h1 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">{title}</h1>
      <p className="text-ink-2 text-[15px] leading-relaxed">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="border-line bg-yellow text-on-bright rounded-lg border-2 px-4 py-2 text-[14px] font-bold no-underline"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
