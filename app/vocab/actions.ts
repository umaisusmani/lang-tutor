'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUserId } from '@/lib/services/profile.service';
import { deleteVocabEntry, saveVocabEntry } from '@/lib/services/vocab.service';

export async function saveVocabAction(candidate: {
  term: string;
  lemma: string;
  translation: string;
}) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  await saveVocabEntry(userId, { ...candidate, source: 'new_word' });
  // Revalidates the /vocab list page's data; the chat UI updates its own
  // chip state locally rather than waiting on a round-trip (see chat.tsx).
  revalidatePath('/vocab');
}

export async function deleteVocabAction(entryId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  await deleteVocabEntry(userId, entryId);
  revalidatePath('/vocab');
}
