import {
  dayStart,
  gradeCard,
  NEW_PER_DAY,
  retrievability,
  REVIEWS_PER_DAY,
  type Grade,
} from '@/lib/srs';
import { createClient } from '@/lib/supabase/server';
import type { Card, CardSchedule, ReviewSurface, VocabEntry } from '@/lib/types/db';

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
  vocab_entry: Pick<VocabEntry, 'term' | 'lemma' | 'translation' | 'example_sentence'> | null;
};

const REVIEW_ITEM_COLUMNS =
  '*, vocab_entry:vocab_entries(term, lemma, translation, example_sentence)';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest typed answer kept in review_logs -- it's for debugging the checker,
 * and it comes from the client. */
const ANSWER_GIVEN_MAX = 200;

/**
 * The learner's day boundaries and how many new cards they've already started
 * today. Shared by the queue and the badge count so the two can't disagree.
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

  const start = dayStart(now, profile?.timezone ?? 'UTC');
  const end = new Date(start.getTime() + DAY_MS);

  // A review log with state 0 is a card's first-ever review: exactly one per
  // card, so this counts new cards introduced, not answers given.
  const { count, error } = await supabase
    .from('review_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('state', 0)
    .gte('reviewed_at', start.toISOString());
  if (error) console.error('[card.service] new-today count failed:', error.message);

  return { start, end, newLeft: Math.max(0, NEW_PER_DAY - (count ?? 0)) };
}

/**
 * The cards to review now, in the order plans/flashcards.md §7.3 sets:
 *
 * 1. Learning/relearning cards due now -- minute-level steps, most urgent.
 * 2. Review cards due by the end of today, lowest retrievability first, so
 *    with a backlog the cards most likely to be forgotten get seen.
 * 3. New cards, oldest saved first, up to what's left of today's allowance.
 *
 * Capped at REVIEWS_PER_DAY, then shuffled: vocab and grammar cards are
 * interleaved rather than shown in blocks by type, which costs more errors
 * during practice and gives better retention after (Nakata & Suzuki 2019).
 * The priority order decides which cards make the cut, not the order shown.
 */
export async function getReviewQueue(userId: string, now = new Date()): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { end, newLeft } = await today(userId, now);

  const base = () =>
    supabase.from('cards').select(REVIEW_ITEM_COLUMNS).eq('user_id', userId).eq('suspended', false);

  const [learning, review, fresh] = await Promise.all([
    base().in('state', [1, 3]).lte('due', now.toISOString()).order('due'),
    base().eq('state', 2).lt('due', end.toISOString()).order('due').limit(REVIEWS_PER_DAY * 5),
    newLeft > 0
      ? base().eq('state', 0).order('created_at').limit(newLeft)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [learning, review, fresh]) {
    if (result.error) {
      console.error('[card.service] getReviewQueue failed:', result.error.message);
      return [];
    }
  }

  const byRecall = ((review.data ?? []) as ReviewItem[])
    .map((card) => ({ card, r: retrievability(card, now) }))
    .sort((a, b) => a.r - b.r)
    .map(({ card }) => card);

  const queue = [
    ...((learning.data ?? []) as ReviewItem[]),
    ...byRecall,
    ...((fresh.data ?? []) as ReviewItem[]),
  ].slice(0, REVIEWS_PER_DAY);

  return shuffle(queue);
}

/**
 * How many cards the queue would hold right now -- the header badge. Counts
 * only, no rows, so it's cheap enough to run on every page load.
 */
export async function getDueCount(userId: string, now = new Date()): Promise<number> {
  const supabase = await createClient();
  const { end, newLeft } = await today(userId, now);

  const count = () =>
    supabase
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('suspended', false);

  const [learning, review, fresh] = await Promise.all([
    count().in('state', [1, 3]).lte('due', now.toISOString()),
    count().eq('state', 2).lt('due', end.toISOString()),
    count().eq('state', 0),
  ]);

  const failed = [learning, review, fresh].find((r) => r.error);
  if (failed) {
    console.error('[card.service] getDueCount failed:', failed.error!.message);
    return 0;
  }

  const total = (learning.count ?? 0) + (review.count ?? 0) + Math.min(fresh.count ?? 0, newLeft);
  return Math.min(total, REVIEWS_PER_DAY);
}

export type RecordReviewResult =
  | { status: 'ok'; next: CardSchedule }
  /** Another tab graded this card first. The caller should refetch, not retry. */
  | { status: 'stale' }
  | { status: 'not_found' }
  | { status: 'error' };

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
  meta: { surface: ReviewSurface; durationMs?: number; answerGiven?: string },
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
