import { isStopword } from '@/lib/stopwords';
import { createClient } from '@/lib/supabase/server';
import type { VocabEntry, VocabSource } from '@/lib/types/db';

/** A word offered as a save candidate, tagged with whether it's already
 * saved -- computed by checking lemmas against the user's own vocab_entries,
 * not by the model (which has no visibility into what's already saved). */
export type VocabCandidate = {
  term: string;
  lemma: string;
  translation: string;
  saved: boolean;
};

/**
 * All reads and writes against `vocab_entries`.
 *
 * Uses the session-scoped client throughout, so RLS enforces ownership --
 * these functions physically cannot reach another user's rows, same pattern
 * as profile.service.ts and mistake.service.ts.
 */

/**
 * Turns raw gloss words into save candidates: drops stopwords, drops
 * duplicate lemmas within the same message (a word repeated in one reply
 * should only offer one chip), and marks which ones the user already saved.
 *
 * One query total, not one per word -- the saved-lemma check is a single
 * `IN (...)` against however many candidate lemmas survive filtering.
 */
export async function getVocabCandidates(
  userId: string,
  words: { word: string; lemma: string; translation: string }[],
): Promise<VocabCandidate[]> {
  const seen = new Set<string>();
  const candidates = words.filter(({ lemma }) => {
    // Glosses are persisted as jsonb, so the `lemma: string` in the type is a
    // promise nothing enforces at read time: messages stored before `lemma`
    // was added to the gloss schema have none. Skip them (no chip is better
    // than saving an inflected form as if it were a dictionary entry) rather
    // than crashing the whole page render.
    if (!lemma || isStopword(lemma)) return false;
    const key = lemma.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (candidates.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('vocab_entries')
    .select('lemma')
    .eq('user_id', userId)
    .in(
      'lemma',
      candidates.map((c) => c.lemma),
    );

  const savedLemmas = new Set((data ?? []).map((r) => r.lemma));

  return candidates.map((c) => ({
    term: c.word,
    lemma: c.lemma,
    translation: c.translation,
    saved: savedLemmas.has(c.lemma),
  }));
}

/**
 * Upsert on the existing UNIQUE(user_id, lemma) constraint -- saving a word
 * that's already saved is a no-op, not an error, so the UI doesn't need to
 * distinguish "first save" from "already there" before calling this.
 */
export async function saveVocabEntry(
  userId: string,
  entry: { term: string; lemma: string; translation: string; source: VocabSource },
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('vocab_entries').upsert(
      {
        user_id: userId,
        term: entry.term,
        lemma: entry.lemma,
        translation: entry.translation,
        source: entry.source,
      },
      { onConflict: 'user_id,lemma', ignoreDuplicates: true },
    );
  } catch (err) {
    console.error('[vocab.service] saveVocabEntry failed:', err);
  }
}

export async function deleteVocabEntry(userId: string, entryId: string): Promise<void> {
  try {
    const supabase = await createClient();
    // user_id here is redundant with RLS (a cross-user delete is already
    // rejected by the policy) but cheap defense-in-depth, same reasoning as
    // mistake.service.ts.
    await supabase.from('vocab_entries').delete().eq('id', entryId).eq('user_id', userId);
  } catch (err) {
    console.error('[vocab.service] deleteVocabEntry failed:', err);
  }
}

export async function listVocab(userId: string): Promise<VocabEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('vocab_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data as VocabEntry[]) ?? [];
}
