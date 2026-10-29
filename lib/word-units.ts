import type { WordGloss } from '@/lib/gloss';

/** Turns word glosses that share a dictionary lemma into one saveable unit. */
export function groupGlossIntoUnits(words: WordGloss): WordGloss {
  const groups = new Map<string, { unit: WordGloss[number]; surfaces: Set<string> }>();

  for (const entry of words) {
    if (!entry.lemma.trim() || !entry.lemmaTranslation.trim()) continue;
    const key = entry.lemma.trim().replace(/\s+/g, ' ').toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        unit: { ...entry, word: '', translation: entry.lemmaTranslation },
        surfaces: new Set<string>(),
      };
      groups.set(key, group);
    }
    if (!group.surfaces.has(entry.word)) group.surfaces.add(entry.word);
  }

  return [...groups.values()].map(({ unit, surfaces }) => ({
    ...unit,
    word: [...surfaces].join(' '),
  }));
}
