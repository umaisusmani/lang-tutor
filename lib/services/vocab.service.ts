import { isStopword } from '@/lib/stopwords';
import { createClient } from '@/lib/supabase/server';
import type { VocabEntry, VocabSource } from '@/lib/types/db';

/** DEPRECATED alongside getVocabCandidates() below -- still referenced by
 * the deprecated app/components/vocab-chips.tsx.
 *
 * A word offered as a save candidate, tagged with whether it's already
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

/** Lemmas per `IN (...)` query in getSavedLemmas -- see the note there. */
const LEMMA_BATCH_SIZE = 100;

/** Longest example sentence stored with a saved word -- see saveVocabEntry(). */
const EXAMPLE_SENTENCE_MAX = 500;

/**
 * Which of these lemmas the user has already saved, lowercased.
 *
 * This is what's left of getVocabCandidates() once saving moved into the
 * gloss panel: every glossed word is offered now, so there is nothing to
 * filter or dedupe server-side and the only question left is which ones
 * should render as ✓ rather than +.
 *
 * Batched, because `.in()` is not free-form: a select goes out as an HTTP GET
 * and every lemma in the list lands in the URL, so the request size grows with
 * the list. A long thread restored at page load can carry several hundred
 * unique lemmas -- measured, ~600 of them is ~8 KB of URL, the point where
 * common proxy and CDN limits start rejecting requests. Chunks of
 * LEMMA_BATCH_SIZE keep each URL around 1.5 KB whatever the thread's length,
 * and run in parallel so a long thread costs a few concurrent round-trips
 * rather than one that can't be sent.
 *
 * Lowercased on the way out because the client keys its Set that way --
 * `lemma` comes from the model, so its casing is only as consistent as the
 * model's, and a ✓ that depends on that is a ✓ that flickers.
 *
 * Returns an array rather than a Set: this crosses the server/client
 * boundary as a streamed data part, and a Set isn't serializable.
 */
export async function getSavedLemmas(userId: string, lemmas: string[]): Promise<string[]> {
  const unique = [...new Set(lemmas.filter(Boolean))];
  if (unique.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += LEMMA_BATCH_SIZE) {
    batches.push(unique.slice(i, i + LEMMA_BATCH_SIZE));
  }

  try {
    const supabase = await createClient();
    const results = await Promise.all(
      batches.map(async (batch) => {
        const { data, error } = await supabase
          .from('vocab_entries')
          .select('lemma')
          .eq('user_id', userId)
          .in('lemma', batch);

        // supabase-js RETURNS request failures (a rejected URL, an RLS
        // error, a network drop) instead of throwing them, so without this
        // check they were invisible: `data` is null, the result is [], and
        // the catch below never runs. Logged per batch so one bad chunk
        // costs its own words their ✓ and nobody else's.
        if (error) {
          console.error('[vocab.service] getSavedLemmas batch failed:', error.message);
          return [];
        }
        return (data ?? []).map((r) => r.lemma.toLowerCase());
      }),
    );

    return results.flat();
  } catch (err) {
    // A failed lookup means words render as + when they're already saved --
    // the save is an idempotent upsert, so the worst case is a wasted click,
    // not a duplicate row. Not worth failing the page render over.
    console.error('[vocab.service] getSavedLemmas failed:', err);
    return [];
  }
}

/**
 * DEPRECATED -- nothing calls this; see getSavedLemmas() above, and the note
 * on app/components/vocab-chips.tsx. Kept so the chips can be revived.
 *
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
 *
 * Returns whether the write went through. supabase-js RETURNS request
 * failures (RLS rejection, a dropped connection, a constraint violation)
 * instead of throwing them, so the old version -- which only had a try/catch
 * -- reported success for a save that never happened, and the UI ticked a word
 * that would be gone on reload. A conflict that `ignoreDuplicates` skips is
 * not an error here, so an already-saved word still returns true.
 *
 * First save wins: `ignoreDuplicates` means an existing row is never updated,
 * so a word saved from a reply as 'new_word' keeps that source (and its first
 * example sentence) even if it's later saved from a correction.
 *
 * The example sentence comes from the client, so it's capped: it's display
 * text the learner already saw, but nothing else stops a caller from sending
 * a megabyte of it.
 */
export async function saveVocabEntry(
  userId: string,
  entry: {
    term: string;
    lemma: string;
    translation: string;
    exampleSentence?: string;
    source: VocabSource;
  },
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('vocab_entries').upsert(
      {
        user_id: userId,
        term: entry.term,
        lemma: entry.lemma,
        translation: entry.translation,
        example_sentence: entry.exampleSentence?.slice(0, EXAMPLE_SENTENCE_MAX) || null,
        source: entry.source,
      },
      { onConflict: 'user_id,lemma', ignoreDuplicates: true },
    );

    if (error) {
      console.error('[vocab.service] saveVocabEntry failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[vocab.service] saveVocabEntry failed:', err);
    return false;
  }
}

/**
 * Returns whether the delete succeeded. Deleting a row that's already gone
 * counts as success -- the learner wanted it gone and it is -- so this only
 * reports false for a real failure, not for "0 rows matched".
 */
export async function deleteVocabEntry(userId: string, entryId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    // user_id here is redundant with RLS (a cross-user delete is already
    // rejected by the policy) but cheap defense-in-depth, same reasoning as
    // mistake.service.ts.
    const { error } = await supabase
      .from('vocab_entries')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) {
      console.error('[vocab.service] deleteVocabEntry failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[vocab.service] deleteVocabEntry failed:', err);
    return false;
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
