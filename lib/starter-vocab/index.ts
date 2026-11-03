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

function searchKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/^(?:der|die|das)\s+(?=\S)/, '')
    .replace(/^sich\s+(?=\S)/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

const SEARCH_INDEX = [...BY_LEMMA.values()].map((word) => {
  const key = searchKey(word.lemma);
  return { word, key, tokens: key.split(' ') };
});

function distanceWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = row[0];
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
          ? previousPrevious[j - 2] + 1 : Infinity,
      );
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previousPrevious = previous;
    previous = row;
  }
  return previous[b.length];
}

function fuzzyDistance(key: string, candidates: string[], max: number): number {
  let best = max + 1;
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - key.length) <= max) {
      best = Math.min(best, distanceWithin(key, candidate, max));
    }
    if (candidate.length > key.length) {
      best = Math.min(best, distanceWithin(key, candidate.slice(0, key.length), max));
    }
    if (best === 1) break;
  }
  return best;
}

/** Finds starter words by their German lemma, regardless of article or diacritics. */
export function searchStarterWords(query: string, limit = 8): StarterWord[] {
  const key = searchKey(query);
  if (!key || key.length > 50 || !Number.isFinite(limit) || limit <= 0) return [];

  const maxDistance = key.length <= 3 ? 0 : key.length <= 6 ? 1 : 2;

  const ranked = SEARCH_INDEX.flatMap((entry) => {
    const rank = entry.key === key ? 0
      : entry.key.startsWith(key) ? 1
        : entry.tokens.some((token) => token.startsWith(key)) ? 2
          : entry.key.includes(key) ? 3 : 4;
    const distance = rank === 4 && maxDistance
      ? fuzzyDistance(key, [entry.key, ...entry.tokens], maxDistance) : 0;
    return rank === 4 && (!maxDistance || distance > maxDistance)
      ? [] : [{ ...entry, rank, distance }];
  });
  ranked.sort((a, b) => a.rank - b.rank
    || a.distance - b.distance
    || a.word.lemma.length - b.word.lemma.length
    || a.word.lemma.localeCompare(b.word.lemma, 'de'));
  return ranked.slice(0, limit).map(({ word }) => word);
}

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
