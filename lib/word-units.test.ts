import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { WordGloss } from '@/lib/gloss';
import { groupGlossIntoUnits } from '@/lib/word-units';

function gloss(word: string, lemma: string, lemmaTranslation: string, translation = 'context'): WordGloss[number] {
  return { word, lemma, lemmaTranslation, translation };
}

test('deduplicates repeated lemmas and surface words', () => {
  assert.deepEqual(groupGlossIntoUnits([
    gloss('Häuser', 'das Haus', 'house'),
    gloss('Häuser', '  DAS   HAUS  ', 'buildings'),
  ]), [gloss('Häuser', 'das Haus', 'house', 'house')]);
});

test('joins separable verb and fixed phrase surfaces into one unit each', () => {
  assert.deepEqual(groupGlossIntoUnits([
    gloss('rufe', 'anrufen', 'to call'),
    gloss('zum', 'zum Beispiel', 'for example'),
    gloss('Beispiel', 'zum Beispiel', 'for example'),
    gloss('an', 'anrufen', 'to call'),
  ]), [
    gloss('rufe an', 'anrufen', 'to call', 'to call'),
    gloss('zum Beispiel', 'zum Beispiel', 'for example', 'for example'),
  ]);
});

test('preserves first appearance order', () => {
  assert.deepEqual(groupGlossIntoUnits([
    gloss('zwei', 'zwei', 'two'),
    gloss('eins', 'eins', 'one'),
    gloss('zwei', 'zwei', 'two'),
  ]).map((unit) => unit.lemma), ['zwei', 'eins']);
});

test('skips empty lemmas or meanings', () => {
  assert.deepEqual(groupGlossIntoUnits([
    gloss('a', ' ', 'a'),
    gloss('b', 'b', ' '),
    gloss('c', 'c', 'see'),
  ]), [gloss('c', 'c', 'see', 'see')]);
});

test('returns an empty list for empty input', () => {
  assert.deepEqual(groupGlossIntoUnits([]), []);
});
