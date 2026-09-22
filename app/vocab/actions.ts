'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUserId } from '@/lib/services/profile.service';
import { deleteVocabEntry, saveVocabEntry } from '@/lib/services/vocab.service';
import type { VocabSource } from '@/lib/types/db';

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
