/**
 * Plain string helpers shared by the client (chat UI) and the server (flashcard
 * cloze building). Pure, no I/O, no React -- moved out of app/chat.tsx and
 * app/components/glossed-text.tsx, which is a 'use client' module the server
 * can't import from.
 */

/** Strips leading/trailing punctuation so a gloss entry still matches a word
 * that carries a comma or full stop in the sentence. */
export function stripPunctuation(word: string): string {
  return word.replace(/^[^\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]+$/g, '');
}

/**
 * Which words in the corrected sentence weren't in what the learner wrote --
 * those get the orange highlight.
 *
 * Deliberately a local diff rather than something the model returns: the
 * correction call already gives us both strings, so asking it to also mark the
 * changed word would be a wider schema (and another thing it can get wrong)
 * for information we can derive exactly. Consuming matches from a multiset
 * means a word the learner used once but the correction uses twice still
 * highlights the second one.
 */
export function changedWordIndices(original: string, corrected: string): Set<number> {
  const pool = new Map<string, number>();
  for (const token of original.split(/\s+/)) {
    const key = stripPunctuation(token).toLowerCase();
    if (key) pool.set(key, (pool.get(key) ?? 0) + 1);
  }

  const changed = new Set<number>();
  corrected.split(/\s+/).forEach((token, i) => {
    const key = stripPunctuation(token).toLowerCase();
    if (!key) return;
    const left = pool.get(key) ?? 0;
    if (left > 0) pool.set(key, left - 1);
    else changed.add(i);
  });
  return changed;
}

/**
 * The sentence a saved word came from, stored as the vocab entry's example.
 * A reply can run to several sentences, and a word is easier to remember in
 * the one sentence it was used in than in a whole paragraph.
 *
 * Splits after . ! ? and takes the first sentence containing the word (compared
 * the same way as changedWordIndices). Falls back to the whole text if nothing
 * matches, so an example is never dropped just because the split was imperfect.
 */
export function sentenceContaining(text: string, word: string): string {
  const target = stripPunctuation(word).toLowerCase();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const match = sentences.find((sentence) =>
    sentence.split(/\s+/).some((token) => stripPunctuation(token).toLowerCase() === target),
  );
  return (match ?? text).trim();
}
