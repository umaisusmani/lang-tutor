'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { getPracticeQueue, getReviewQueue, recordReview, type RecordReviewResult } from '@/lib/services/card.service';
import { getCurrentUserId, resolveCefrLevel } from '@/lib/services/profile.service';
import { deleteVocabEntry, listVocab, saveVocabEntry } from '@/lib/services/vocab.service';
import { findStarterWord, pickStarterWords } from '@/lib/starter-vocab';
import { translateStarterWord } from '@/lib/starter-vocab/translate';
import type { Grade } from '@/lib/srs';
import type { CardDirection, CardSchedule, ReviewSurface, VocabSource } from '@/lib/types/db';

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
  /** forward: German -> meaning. reverse: meaning -> German. */
  direction: CardDirection;
  lemma: string;
  translation: string | null;
  exampleSentence: string | null;
  schedule: CardSchedule;
};

/** A word from the starter list, offered mid-session with an "Add" button. */
export type DiscoverCard = { lemma: string; example: string; exampleTranslation: string };

export type SessionPayload = {
  cards: SessionCard[];
  discover: DiscoverCard[];
  /** True when these are extra cards that aren't due yet. */
  extra: boolean;
};

/** New words offered per session. */
const DISCOVER_PER_SESSION = 3;

/**
 * Loads the queue for a "Start session" click ('due'), or a round of extra
 * practice ('practice') once nothing is due. Done on click, not with the
 * page, so opening /vocab to browse costs no more than it did before.
 */
export async function startSessionAction(
  mode: 'due' | 'practice' = 'due',
  /** Starter words the learner skipped before (kept in their browser). */
  skippedLemmas: string[] = [],
): Promise<SessionPayload | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  let queue = mode === 'practice' ? await getPracticeQueue(userId) : await getReviewQueue(userId);
  // Nothing due: start on extra practice instead of an empty screen. The
  // schedule is a guide to what's most useful, not a gate on practising.
  let extra = mode === 'practice';
  if (queue.length === 0 && !extra) {
    queue = await getPracticeQueue(userId);
    extra = true;
  }
  const cards: SessionCard[] = [];
  // A word has a card per direction. Only one of them goes into a session, so
  // answering one doesn't hand over the answer to its sibling (Anki calls this
  // burying siblings). The other waits for the next session.
  const seenWords = new Set<string>();
  for (const item of queue) {
    // Grammar cards (F4) carry no vocab_entry and have their own front.
    if (!item.vocab_entry) continue;
    const direction = item.direction ?? 'forward';
    // A reverse card asks from the English meaning; without one it can't ask.
    if (direction === 'reverse' && !item.vocab_entry.translation) continue;
    if (item.vocab_entry_id) {
      if (seenWords.has(item.vocab_entry_id)) continue;
      seenWords.add(item.vocab_entry_id);
    }
    cards.push({
      id: item.id,
      direction,
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

  // New words from the starter list, for the learner's level, skipping
  // anything already saved. Not scheduled: they only become cards if added.
  const level = await resolveCefrLevel(userId, (await cookies()).get('cefr_level')?.value);
  const saved = new Set((await listVocab(userId)).map((e) => e.lemma.toLowerCase()));
  for (const lemma of skippedLemmas.slice(0, 1000)) saved.add(String(lemma).toLowerCase());
  const discover = pickStarterWords(level, saved, DISCOVER_PER_SESSION);

  return { cards, discover, extra };
}

/**
 * Adds a starter word to the learner's vocab (which creates its card, via the
 * database trigger). The example and level come from the shipped list, looked
 * up by lemma -- the client only says which word.
 */
export async function addStarterWordAction(lemma: string): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const word = findStarterWord(lemma);
  if (!word) return { ok: false };

  try {
    const translation = await translateStarterWord(word, { userId });
    const ok = await saveVocabEntry(userId, {
      term: word.lemma,
      lemma: word.lemma,
      translation,
      exampleSentence: word.example,
      source: 'new_word',
    });
    if (ok) revalidatePath('/', 'layout');
    return { ok };
  } catch (err) {
    console.error('[vocab] addStarterWordAction failed:', err);
    return { ok: false };
  }
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
