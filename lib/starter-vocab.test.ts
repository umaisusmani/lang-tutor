import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findStarterWord, pickStarterWords } from './starter-vocab';

describe('findStarterWord', () => {
  it('finds a word case-insensitively and returns null for unknown ones', () => {
    assert.ok(findStarterWord('der bahnhof'));
    assert.equal(findStarterWord('Raumschiffkapitän'), null);
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
