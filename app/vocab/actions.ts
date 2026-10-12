'use server';

import { revalidatePath } from 'next/cache';

import { getReviewQueue, recordReview, type RecordReviewResult } from '@/lib/services/card.service';
import { getCurrentUserId } from '@/lib/services/profile.service';
import { deleteVocabEntry, saveVocabEntry } from '@/lib/services/vocab.service';
import type { Grade } from '@/lib/srs';
import type { CardSchedule, ReviewSurface, VocabSource } from '@/lib/types/db';

/**
 * `source` records where the learner met the word, which is the whole
 * difference between "I liked this word" and "I got this wrong": a word saved
 * from a correction's gloss is one the learner demonstrably didn't have, so
 * it comes in tagged 'mistake' and the /vocab page can weight it differently.
 * Defaulted rather than required so the deprecated chips still compile.
 *
 * Not trusted for authorization -- it only labels a row the user already owns
 * by virtue of userId coming from the session, never from the client.
 */
export async function saveVocabAction(
  candidate: {
    term: string;
    lemma: string;
    translation: string;
    /** The sentence the word was met in; optional so the deprecated chips still compile. */
    exampleSentence?: string;
  },
  source: VocabSource = 'new_word',
): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const ok = await saveVocabEntry(userId, { ...candidate, source });
  // Revalidates the /vocab list page's data; the chat UI updates its own
  // saved state locally rather than waiting on a round-trip (see chat.tsx).
  if (ok) revalidatePath('/vocab');
  // `ok` is returned so the client can undo its optimistic tick and say so --
  // a save that silently failed used to leave a word showing as saved.
  return { ok };
}

export async function deleteVocabAction(entryId: string): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const ok = await deleteVocabEntry(userId, entryId);
  if (ok) revalidatePath('/vocab');
  return { ok };
}

/** One flashcard as the session UI needs it: the word, what to show on the
 * back, and the schedule the grade buttons preview their intervals from. */
export type SessionCard = {
  id: string;
  lemma: string;
  translation: string | null;
  exampleSentence: string | null;
  schedule: CardSchedule;
};

/**
 * Loads today's queue for a "Start session" click. Done on click, not with the
 * page, so opening /vocab to browse costs no more than it did before.
 */
export async function startSessionAction(): Promise<SessionCard[] | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const queue = await getReviewQueue(userId);
  const cards: SessionCard[] = [];
  for (const item of queue) {
    // Grammar cards (F4) carry no vocab_entry and have their own front.
    if (!item.vocab_entry) continue;
    cards.push({
      id: item.id,
      lemma: item.vocab_entry.lemma,
      translation: item.vocab_entry.translation,
      exampleSentence: item.vocab_entry.example_sentence,
      schedule: {
        state: item.state,
        due: item.due,
        stability: item.stability,
        difficulty: item.difficulty,
        scheduled_days: item.scheduled_days,
        learning_steps: item.learning_steps,
        reps: item.reps,
        lapses: item.lapses,
        last_review: item.last_review,
      },
    });
  }
  return cards;
}

/**
 * Grades one card. The user id comes from the session, never the client, and
 * the card is re-read server-side (see recordReview) -- the client sends only
 * which card and which button.
 *
 * `rating` and `surface` arrive from the browser, so both are validated here
 * rather than trusted to be the unions their types say.
 */
export async function gradeCardAction(
  cardId: string,
  rating: number,
  meta: { surface: ReviewSurface; durationMs?: number; answerGiven?: string },
): Promise<RecordReviewResult | { status: 'unauthenticated' }> {
  const userId = await getCurrentUserId();
  if (!userId) return { status: 'unauthenticated' };

  if (!Number.isInteger(rating) || rating < 1 || rating > 4) return { status: 'error' };
  if (meta.surface !== 'panel' && meta.surface !== 'review_page') return { status: 'error' };

  const result = await recordReview(userId, cardId, rating as Grade, meta);
  // The header's due badge is rendered by other pages' Server Components.
  if (result.status === 'ok') revalidatePath('/', 'layout');
  return result;
}
