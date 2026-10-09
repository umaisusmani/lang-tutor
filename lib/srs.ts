import {
  fsrs,
  Rating,
  type Card as FsrsCard,
  type Grade,
  type ReviewLog as FsrsReviewLog,
} from 'ts-fsrs';

import type { CardSchedule, CardState } from '@/lib/types/db';

/**
 * The spaced-repetition scheduler: the only file that imports ts-fsrs.
 *
 * The rest of the app speaks database rows (snake_case strings for dates);
 * ts-fsrs speaks its own Card objects (Date instances, a deprecated
 * elapsed_days field). Converting in one place means a library upgrade -- v6
 * drops elapsed_days -- or an algorithm change touches only this file, the
 * same reasoning that keeps SQL inside lib/services.
 *
 * Pure: no I/O. card.service.ts reads rows, calls these, and writes the
 * result through the record_review RPC.
 */

/** New cards introduced per learner-day. What stops 300 saved words turning
 * into 300 reviews tomorrow -- Anki's single most-cited lesson. */
export const NEW_PER_DAY = 10;

/** Total cards per learner-day. Lower than Anki's default on purpose: reviews
 * here fit around conversation, they don't replace it. */
export const REVIEWS_PER_DAY = 100;

/** A learner-day starts at 4am local time, as in Anki, so a late-night session
 * counts toward the day the learner thinks it belongs to. */
export const DAY_START_HOUR = 4;

/** Answer buttons, re-exported so callers don't import ts-fsrs themselves. */
export const Grades = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy,
} as const;
export type { Grade };

/**
 * 0.9 desired retention is FSRS's default: schedule each review for the day
 * recall probability is predicted to drop to 90%. Fuzz adds a small random
 * offset to intervals so cards saved on the same day don't stay bunched on
 * the same due dates forever. Learning steps stay at ts-fsrs's defaults
 * (1m, 10m; relearning 10m).
 */
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

/** A database row (or any object carrying its schedule fields) as a ts-fsrs Card. */
export function rowToCard(row: CardSchedule): FsrsCard {
  return {
    state: row.state,
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    // Deprecated in ts-fsrs and not stored: the scheduler recomputes it from
    // last_review at the start of every review, so 0 here is never read.
    elapsed_days: 0,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** A ts-fsrs Card back to the columns record_review writes. */
export function cardToRow(card: FsrsCard): CardSchedule {
  return {
    state: card.state as CardState,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** The review_logs columns the scheduler decides (the rest -- surface, timing,
 * what was typed -- come from the caller). */
export interface ScheduledLog {
  rating: Grade;
  /** The card's state BEFORE this review. */
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reviewed_at: string;
}

function logToRow(log: FsrsReviewLog): ScheduledLog {
  return {
    rating: log.rating as Grade,
    state: log.state as CardState,
    due: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    reviewed_at: log.review.toISOString(),
  };
}

/** Grades a card: its next schedule, and the log line describing this review. */
export function gradeCard(
  row: CardSchedule,
  rating: Grade,
  now: Date,
): { next: CardSchedule; log: ScheduledLog } {
  const { card, log } = scheduler.next(rowToCard(row), now, rating);
  return { next: cardToRow(card), log: logToRow(log) };
}

/** When the card would come back for each button -- the labels on /review's
 * four buttons ("Good · 3d"), as Anki shows them. */
export function previewIntervals(row: CardSchedule, now: Date): Record<Grade, Date> {
  const preview = scheduler.repeat(rowToCard(row), now);
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  } as Record<Grade, Date>;
}

/** "10m", "3h", "5d", "2mo": how far off a due date is, as the grade buttons
 * label it. Rounds to the nearest whole unit; never shows less than "1m". */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo` : `${Math.round(days / 365)}y`;
}

/** Predicted probability (0-1) the learner recalls this card right now. Used
 * to see the most-likely-forgotten cards first when there's a backlog. */
export function retrievability(row: CardSchedule, now: Date): number {
  return scheduler.get_retrievability(rowToCard(row), now, false);
}

/**
 * The instant the learner's current day began: the most recent 4am in their
 * timezone. Falls back to UTC for a timezone Intl doesn't know -- it's
 * stored on the profile, so it should be valid, but a bad value should cost
 * the learner an hour of accuracy, not the review page.
 *
 * No date library: Intl gives the wall-clock time in any zone, and the
 * offset is read at the candidate instant itself, so a DST change on the day
 * in question still lands on the right hour.
 */
export function dayStart(now: Date, timeZone: string): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';

  // Shift back by the day-start hour, then take that moment's calendar date:
  // 03:00 local belongs to the previous day, 05:00 to today.
  const shifted = new Date(now.getTime() - DAY_START_HOUR * 3_600_000);
  const { year, month, day } = wallClock(shifted, zone);

  // 04:00 on that date, as if the zone were UTC, then corrected by the zone's
  // offset. Corrected twice: the first guess can sit on the other side of a
  // DST change from the real answer.
  const naive = Date.UTC(year, month - 1, day, DAY_START_HOUR);
  let guess = naive - offsetMs(new Date(naive), zone);
  guess = naive - offsetMs(new Date(guess), zone);
  return new Date(guess);
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far the zone's wall clock is ahead of UTC at this instant. */
function offsetMs(date: Date, timeZone: string): number {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
