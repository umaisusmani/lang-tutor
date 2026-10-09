import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cardToRow,
  dayStart,
  formatInterval,
  gradeCard,
  Grades,
  previewIntervals,
  rowToCard,
} from '@/lib/srs';
import type { CardSchedule } from '@/lib/types/db';

/** A card as the database creates it: the column defaults in 0005. */
const newCard = (due = '2026-10-08T10:00:00.000Z'): CardSchedule => ({
  state: 0,
  due,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  last_review: null,
});

const at = (iso: string) => new Date(iso);
const minutesBetween = (a: string, b: Date) => (b.getTime() - new Date(a).getTime()) / 60_000;

describe('row <-> card', () => {
  test('a database row survives the round trip unchanged', () => {
    const row: CardSchedule = {
      state: 2,
      due: '2026-10-20T08:30:00.000Z',
      stability: 12.5,
      difficulty: 5.1,
      scheduled_days: 12,
      learning_steps: 0,
      reps: 4,
      lapses: 1,
      last_review: '2026-10-08T08:30:00.000Z',
    };
    assert.deepEqual(cardToRow(rowToCard(row)), row);
  });

  test('a never-reviewed card keeps last_review null', () => {
    assert.equal(cardToRow(rowToCard(newCard())).last_review, null);
  });
});

describe('learning steps (1m, 10m)', () => {
  const now = at('2026-10-08T10:00:00.000Z');

  test('Good on a new card: learning, back in 10 minutes', () => {
    const { next, log } = gradeCard(newCard(), Grades.Good, now);
    assert.equal(next.state, 1);
    assert.equal(minutesBetween(now.toISOString(), new Date(next.due)), 10);
    assert.equal(next.reps, 1);
    assert.equal(log.state, 0, 'the log records the state BEFORE the review');
  });

  test('Again on a new card: back in 1 minute', () => {
    const { next } = gradeCard(newCard(), Grades.Again, now);
    assert.equal(next.state, 1);
    assert.equal(minutesBetween(now.toISOString(), new Date(next.due)), 1);
  });

  test('Good twice graduates the card to review, due in days', () => {
    const first = gradeCard(newCard(), Grades.Good, now).next;
    const later = new Date(first.due);
    const { next } = gradeCard(first, Grades.Good, later);
    assert.equal(next.state, 2);
    assert.ok(next.scheduled_days >= 1, `scheduled ${next.scheduled_days} days`);
  });

  test('Again on a review card sends it to relearning and counts a lapse', () => {
    let card = gradeCard(newCard(), Grades.Good, now).next;
    card = gradeCard(card, Grades.Good, new Date(card.due)).next;
    const { next } = gradeCard(card, Grades.Again, new Date(card.due));
    assert.equal(next.state, 3);
    assert.equal(next.lapses, 1);
  });

  test('preview: each button schedules later than the one before', () => {
    const p = previewIntervals(newCard(), now);
    const order = [Grades.Again, Grades.Hard, Grades.Good, Grades.Easy].map((g) => p[g].getTime());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});

describe('dayStart (4am local)', () => {
  test('after 4am: today at 4am', () => {
    // Karachi is UTC+5, no DST. 06:00 local on Oct 8 -> Oct 8 04:00 local.
    assert.equal(
      dayStart(at('2026-10-08T01:00:00Z'), 'Asia/Karachi').toISOString(),
      '2026-10-07T23:00:00.000Z',
    );
  });

  test('before 4am: still the previous day', () => {
    // 03:00 local on Oct 8 -> Oct 7 04:00 local.
    assert.equal(
      dayStart(at('2026-10-07T22:00:00Z'), 'Asia/Karachi').toISOString(),
      '2026-10-06T23:00:00.000Z',
    );
  });

  test('on the day DST ends, 4am uses the new offset', () => {
    // Berlin leaves summer time at 03:00 on Oct 25, 2026, so 04:00 is
    // already CET (UTC+1), i.e. 03:00Z.
    assert.equal(
      dayStart(at('2026-10-25T10:00:00Z'), 'Europe/Berlin').toISOString(),
      '2026-10-25T03:00:00.000Z',
    );
  });

  test('an unknown timezone falls back to UTC', () => {
    assert.equal(
      dayStart(at('2026-10-08T10:00:00Z'), 'Not/AZone').toISOString(),
      '2026-10-08T04:00:00.000Z',
    );
  });
});

describe('formatInterval', () => {
  const from = at('2026-10-08T10:00:00Z');
  const after = (ms: number) => new Date(from.getTime() + ms);
  const MIN = 60_000;

  test('minutes, hours, days, months', () => {
    assert.equal(formatInterval(from, after(10 * MIN)), '10m');
    assert.equal(formatInterval(from, after(3 * 60 * MIN)), '3h');
    assert.equal(formatInterval(from, after(5 * 24 * 60 * MIN)), '5d');
    assert.equal(formatInterval(from, after(70 * 24 * 60 * MIN)), '2mo');
  });

  test('never shows less than a minute', () => {
    assert.equal(formatInterval(from, from), '1m');
  });
});
