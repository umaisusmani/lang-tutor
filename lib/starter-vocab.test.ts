import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findStarterWord, pickStarterWords, searchStarterWords } from './starter-vocab';

describe('findStarterWord', () => {
  it('finds a word case-insensitively and returns null for unknown ones', () => {
    assert.ok(findStarterWord('der bahnhof'));
    assert.equal(findStarterWord('Raumschiffkapitän'), null);
  });
});

describe('searchStarterWords', () => {
  it('finds prefixes and returns the original word objects', () => {
    assert.ok(searchStarterWords('bahnh').includes(findStarterWord('der Bahnhof')!));
  });

  it('folds umlauts and eszett and accepts typed articles', () => {
    assert.ok(searchStarterWords('uber').some((word) => word.lemma.startsWith('über')));
    assert.ok(findStarterWord('die Straße'));
    assert.ok(searchStarterWords('strasse').includes(findStarterWord('die Straße')!));
    assert.ok(searchStarterWords('der bahnhof').includes(findStarterWord('der Bahnhof')!));
  });

  it('ranks exact matches before prefixes', () => {
    assert.equal(searchStarterWords('ab')[0].lemma, 'ab');
  });

  it('keeps article and reflexive-pronoun queries searchable', () => {
    assert.ok(searchStarterWords('die').length > 0);
    assert.ok(searchStarterWords('die').some((word) => word.lemma === 'dienen'));
    assert.equal(searchStarterWords('der')[0].lemma, 'der');
    assert.ok(searchStarterWords('sich').some((word) => word.lemma === 'sich'));
    assert.ok(searchStarterWords('das').some((word) => word.lemma === 'das'));
    assert.equal(searchStarterWords('der ')[0].lemma, 'der');
  });

  it('respects limits without duplicate lemmas', () => {
    const words = searchStarterWords('a', 6);
    assert.equal(words.length, 6);
    assert.equal(new Set(words.map((word) => word.lemma)).size, words.length);
  });

  it('rejects empty and over-long queries', () => {
    for (const query of ['', '  ', 'x'.repeat(51)]) {
      assert.deepEqual(searchStarterWords(query), []);
    }
  });
});

describe('pickStarterWords', () => {
  it('returns the requested number of distinct words', () => {
    const words = pickStarterWords('A2', new Set(), 5);
    assert.equal(words.length, 5);
    assert.equal(new Set(words.map((w) => w.lemma)).size, 5);
  });

  it('never returns a word the learner already saved', () => {
    const saved = new Set(['der bahnhof', 'die adresse']);
    for (let i = 0; i < 20; i++) {
      for (const w of pickStarterWords('A1', saved, 10)) {
        assert.ok(!saved.has(w.lemma.toLowerCase()));
      }
    }
  });

  it('uses the B1 list for B2 and C1, and the A1 list alone for A1', () => {
    assert.equal(pickStarterWords('C1', new Set(), 3).length, 3);
    const a1 = pickStarterWords('A1', new Set(), 4, () => 0.5);
    for (const w of a1) assert.ok(findStarterWord(w.lemma));
  });
});
