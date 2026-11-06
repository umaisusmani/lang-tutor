import {
  dayEnd,
  dayStart,
  gradeCard,
  NEW_PER_SESSION,
  retrievability,
  REVIEWS_PER_SESSION,
  type Grade,
} from '@/lib/srs';
import { createClient } from '@/lib/supabase/server';
import { pickNewWords, selectReviewWords } from '@/lib/review-session';
import type { Card, CardSchedule, CardState, ReviewSurface, VocabEntry } from '@/lib/types/db';

/**
 * All reads and writes against `cards` and `review_logs`.
 *
 * Session-scoped client throughout, like every other user-data service, so
 * RLS is the access control. Cards are never created here: a vocab card is
 * created by the database trigger when a word is saved (0005), and grammar
 * cards arrive in F4.
 *
 * The scheduling maths is lib/srs.ts; this file only fetches rows for it and
 * writes back what it decides.
 */

/** A due card plus what's needed to render it. `vocab_entry` is null on a
 * grammar card, which carries its own cloze_text/answer/hint. */
export type ReviewItem = Card & {
  vocab_entry: Pick<VocabEntry, 'term' | 'lemma' | 'translation' | 'example_sentence' | 'example_translation'> | null;
};

const REVIEW_ITEM_COLUMNS =
  '*, vocab_entry:vocab_entries(term, lemma, translation, example_sentence, example_translation)';

/** Longest typed answer kept in review_logs -- it's for debugging the checker,
 * and it comes from the client. */
const ANSWER_GIVEN_MAX = 200;

export type WordSchedule = { suspended: boolean; state: CardState; nextDue: string | null };

export async function getWordSchedules(userId: string): Promise<Record<string, WordSchedule>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('cards')
    .select('vocab_entry_id,state,due,suspended').eq('user_id', userId).not('vocab_entry_id', 'is', null);
  if (error) {
    console.error('[card.service] getWordSchedules failed:', error.message);
    throw new Error('Could not load word schedules.');
  }
  const grouped: Record<string, { suspended: boolean; cards: { state: CardState; due: string; suspended: boolean }[] }> = {};
  for (const card of data ?? []) {
    if (!card.vocab_entry_id) continue;
    const group = grouped[card.vocab_entry_id] ??= { suspended: true, cards: [] };
    group.cards.push({ state: card.state as CardState, due: card.due, suspended: card.suspended });
    if (!card.suspended) group.suspended = false;
  }
  const schedules: Record<string, WordSchedule> = {};
  for (const [id, group] of Object.entries(grouped)) {
    const eligible = group.suspended ? group.cards : group.cards.filter((card) => !card.suspended);
    const priority = (state: CardState) => state === 1 || state === 3 ? 0 : state === 2 ? 1 : 2;
    eligible.sort((a, b) => priority(a.state) - priority(b.state) || a.due.localeCompare(b.due));
    schedules[id] = {
      suspended: group.suspended,
      state: eligible[0].state,
      nextDue: group.suspended ? null : eligible.reduce<string | null>((earliest, card) =>
        earliest === null || card.due < earliest ? card.due : earliest, null),
    };
  }
  return schedules;
}

export async function setWordSuspended(userId: string, entryId: string, suspended: boolean): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('cards').update({ suspended })
      .eq('vocab_entry_id', entryId).eq('user_id', userId);
    if (error) {
      console.error('[card.service] setWordSuspended failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[card.service] setWordSuspended failed:', err);
    return false;
  }
}

/**
 * The learner's day boundaries: used to bury words reviewed today and to
 * include review cards due before the next local 4am.
 */
async function today(userId: string, now: Date) {
  const supabase = await createClient();

  // Read here rather than through getProfile(): that function is on every
  // chat request's path, and selecting a column that only exists once 0005 is
  // applied would turn a missed migration into every user's level silently
  // resetting. Here, a failed read costs the day-start accuracy, nothing more.
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .single();

  const timeZone = profile?.timezone ?? 'UTC';
  const start = dayStart(now, timeZone);
  const end = dayEnd(now, timeZone);

  return { start, end };
}

/** Bury a word's other direction for today; due learning steps remain eligible. */
async function reviewedWordsSince(userId: string, start: Date): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('cards')
    .select('vocab_entry_id').eq('user_id', userId).gte('last_review', start.toISOString());
  if (error) throw new Error('Could not load review progress.');
  return new Set((data ?? []).flatMap((card) => card.vocab_entry_id ? [card.vocab_entry_id as string] : []));
}

/**
 * The cards to review now, in the order plans/flashcards.md §7.3 sets:
 *
 * 1. Learning/relearning cards due now -- minute-level steps, most urgent.
 * 2. Review cards due by the end of today, lowest retrievability first, so
 *    with a backlog the cards most likely to be forgotten get seen.
 * 3. New cards, oldest saved first, up to `NEW_PER_SESSION` words.
 *
 * Capped at `REVIEWS_PER_SESSION`, then shuffled: vocab and grammar cards are
 * interleaved rather than shown in blocks by type, which costs more errors
 * during practice and gives better retention after (Nakata & Suzuki 2019).
 * The priority order decides which cards make the cut, not the order shown.
 */
export async function getReviewQueue(userId: string, now = new Date()): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { start, end } = await today(userId, now);
  const reviewedWords = await reviewedWordsSince(userId, start);

  const base = () =>
    supabase.from('cards').select(REVIEW_ITEM_COLUMNS).eq('user_id', userId).eq('suspended', false);

  const [learning, review, fresh] = await Promise.all([
    base().in('state', [1, 3]).lte('due', now.toISOString()).order('due'),
    base().eq('state', 2).lt('due', end.toISOString()).order('due').limit(REVIEWS_PER_SESSION * 5),
    base().eq('state', 0).order('created_at').limit(Math.max(40, NEW_PER_SESSION * 4)),
  ]);

  for (const result of [learning, review, fresh]) {
    if (result.error) {
      console.error('[card.service] getReviewQueue failed:', result.error.message);
      throw new Error('Could not load your review cards.');
    }
  }

  const byRecall = ((review.data ?? []) as ReviewItem[])
    .map((card) => ({ card, r: retrievability(card, now) }))
    .sort((a, b) => a.r - b.r)
    .map(({ card }) => card);

  const queue = selectReviewWords([
    ...((learning.data ?? []) as ReviewItem[]),
    ...byRecall.filter((card) => !reviewedWords.has(card.vocab_entry_id ?? '')),
    ...pickNewWords((fresh.data ?? []) as ReviewItem[], reviewedWords, NEW_PER_SESSION),
  ]).slice(0, REVIEWS_PER_SESSION);

  return shuffle(queue);
}

/** How many extra cards one "practice more" round pulls. */
export const PRACTICE_SIZE = 10;

/**
 * Cards to practice when nothing (more) is due -- Anki's "review ahead".
 *
 * Takes review cards not due until tomorrow or later, then new cards after
 * the first `NEW_PER_SESSION` words offered by the regular queue. Words reviewed
 * today and waiting learning steps are excluded, so extra practice doesn't
 * immediately repeat the completed round. Graded like a due card; FSRS
 * accounts for the shorter elapsed time, so an early "Good" simply stretches
 * the interval less than an on-time one would.
 * Each practice round is bounded by `limit`.
 */
export async function getPracticeQueue(
  userId: string,
  now = new Date(),
  limit = PRACTICE_SIZE,
): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { start, end } = await today(userId, now);
  const reviewedWords = await reviewedWordsSince(userId, start);

  const base = () =>
    supabase.from('cards').select(REVIEW_ITEM_COLUMNS).eq('user_id', userId).eq('suspended', false);

  const [ahead, fresh] = await Promise.all([
    base().eq('state', 2).gte('due', end.toISOString()).order('due').order('id').limit(500),
    // Fetch enough rows to skip the first NEW_PER_SESSION words offered by the regular queue.
    base()
      .eq('state', 0)
      .order('created_at')
      .limit(Math.max(40, (NEW_PER_SESSION + limit) * 4)),
  ]);

  for (const result of [ahead, fresh]) {
    if (result.error) {
      console.error('[card.service] getPracticeQueue failed:', result.error.message);
      throw new Error('Could not load extra practice.');
    }
  }

  const byRecall = ((ahead.data ?? []) as ReviewItem[])
    .map((card) => ({ card, r: retrievability(card, now) }))
    .sort((a, b) => a.r - b.r)
    .map(({ card }) => card);

  return shuffle(
    selectReviewWords([
      ...byRecall,
      ...pickNewWords((fresh.data ?? []) as ReviewItem[], reviewedWords, limit, NEW_PER_SESSION),
    ].filter((card) => !reviewedWords.has(card.vocab_entry_id ?? '')))
      .slice(0, limit),
  );
}

/**
 * Count the same usable words and directions that a session will actually show.
 */
export async function getDueCount(userId: string, now = new Date()): Promise<number> {
  try {
    return (await getReviewQueue(userId, now)).length;
  } catch (error) {
    console.error('[card.service] getDueCount failed:', error);
    return 0;
  }
}

export type RecordReviewResult =
  | { status: 'ok'; next: CardSchedule }
  /** Another tab graded this card first. The caller should refetch, not retry. */
  | { status: 'stale' }
  | { status: 'not_found' }
  | { status: 'error' };

export type UndoReviewResult =
  | { status: 'ok'; schedule: CardSchedule }
  | { status: 'stale' }
  | { status: 'error' };

/** Restores the most recent grade only if this card still has its saved version. */
export async function undoReview(userId: string, cardId: string, expectedReps: number, previousDue: string): Promise<UndoReviewResult> {
  if (!userId) return { status: 'error' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('undo_review', {
    p_card_id: cardId,
    p_expected_reps: expectedReps,
    p_previous_due: previousDue,
  });
  if (error) {
    console.error('[card.service] undo_review failed:', error.message);
    return { status: 'error' };
  }
  return data ? { status: 'ok', schedule: data as CardSchedule } : { status: 'stale' };
}

/**
 * Grades one card and writes the new schedule plus its log line, atomically,
 * through the record_review RPC (0005).
 *
 * The card is read fresh here rather than trusted from the client: the
 * client's copy can be minutes old, and its `reps` is the version the RPC
 * checks. Reading it again doesn't remove the two-tab race -- the RPC's
 * `reps = expected` check does that -- it just means the race is decided
 * against the latest state.
 */
export async function recordReview(
  userId: string,
  cardId: string,
  rating: Grade,
  meta: { surface: ReviewSurface; durationMs?: number; answerGiven?: string; expectedReps?: number },
  now = new Date(),
): Promise<RecordReviewResult> {
  if (![1, 2, 3, 4].includes(rating)) return { status: 'error' };

  const supabase = await createClient();
  const { data: row, error: readError } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[card.service] recordReview read failed:', readError.message);
    return { status: 'error' };
  }
  if (!row) return { status: 'not_found' };

  const card = row as Card;
  // Retrying after a lost response must not apply a successful grade twice.
  if (meta.expectedReps !== undefined && meta.expectedReps !== card.reps) return { status: 'stale' };
  const { next, log } = gradeCard(card, rating, now);

  const durationMs =
    meta.durationMs != null && Number.isFinite(meta.durationMs) && meta.durationMs >= 0
      ? Math.min(Math.round(meta.durationMs), 2_147_483_647)
      : null;

  const { data: written, error } = await supabase.rpc('record_review', {
    p_card_id: cardId,
    p_expected_reps: card.reps,
    p_card: next,
    p_log: {
      ...log,
      duration_ms: durationMs,
      surface: meta.surface,
      answer_given: meta.answerGiven?.slice(0, ANSWER_GIVEN_MAX) ?? null,
    },
  });

  if (error) {
    console.error('[card.service] record_review failed:', error.message);
    return { status: 'error' };
  }
  return written ? { status: 'ok', next } : { status: 'stale' };
}

/** Fisher-Yates, in place on a copy. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
