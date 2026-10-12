import { type CefrLevel } from '@/lib/prompts';

import a1 from './a1.json';
import a2 from './a2.json';
import b1 from './b1.json';

/**
 * Starter vocabulary: the Goethe-Institut word lists (A1-B1), parsed by
 * scripts/import-wordlist.ts. Offered in flashcard sessions as "new word"
 * cards the learner can add to their vocab.
 *
 * Each word has a German example and that example's English translation, but
 * no translation of the word itself -- that's fetched when a word is added
 * (see translate.ts), so only words the learner wants cost an LLM call.
 *
 * Words are listed once, at the lowest level that has them. B2 and C1 use the
 * B1 list, the highest we have.
 */
export type StarterWord = { lemma: string; example: string; exampleTranslation: string };

const LISTS = { A1: a1, A2: a2, B1: b1 } as Record<string, StarterWord[]>;
const ORDER = ['A1', 'A2', 'B1'] as const;

const BY_LEMMA = new Map<string, StarterWord>(
  ORDER.flatMap((level) => LISTS[level]).map((w) => [w.lemma.toLowerCase(), w]),
);

/** Looks a word up by lemma; the server uses this so it never trusts a
 * client-sent example or translation. */
export function findStarterWord(lemma: string): StarterWord | null {
  return BY_LEMMA.get(lemma.trim().toLowerCase()) ?? null;
}

/**
 * `count` words the learner hasn't saved: about two thirds from their own
 * level, the rest from the level below (words they may not have met yet in
 * conversation). Falls back to whatever's available if one pool runs short.
 */
export function pickStarterWords(
  level: CefrLevel,
  savedLemmas: ReadonlySet<string>,
  count: number,
  rng: () => number = Math.random,
): StarterWord[] {
  const own = Math.min(ORDER.indexOf(level as (typeof ORDER)[number]), ORDER.length - 1);
  const ownIndex = own === -1 ? ORDER.length - 1 : own; // B2, C1 -> B1
  const free = (index: number) =>
    shuffle(
      (LISTS[ORDER[index]] ?? []).filter((w) => !savedLemmas.has(w.lemma.toLowerCase())),
      rng,
    );

  const ownPool = free(ownIndex);
  const belowPool = ownIndex > 0 ? free(ownIndex - 1) : [];
  const fromOwn = ownPool.splice(0, Math.ceil((count * 2) / 3));
  const fromBelow = belowPool.splice(0, count - fromOwn.length);
  return [...fromOwn, ...fromBelow, ...ownPool].slice(0, count);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
