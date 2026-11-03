import assert from 'node:assert/strict';
import { it } from 'node:test';

import { normalizeLookedUpWords } from './word-lookup';

it('trims, caps, deduplicates, and limits lookup entries', () => {
  const word = (lemma: string) => ({ lemma, meaning: ` ${'m'.repeat(90)} `,
    example: ` ${'e'.repeat(210)} `, exampleTranslation: ` ${'t'.repeat(210)} ` });
  const result = normalizeLookedUpWords([
    word('  Haus  '), word('haus'), word(' '), { ...word('skip'), meaning: '  ' },
    ...'abcdef'.split('').map((letter) => word(` ${letter.repeat(70)} `)),
  ]);
  assert.equal(result.length, 5);
  assert.equal(result[0].lemma, 'Haus');
  assert.equal(result[0].meaning.length, 80);
  assert.equal(result[0].example.length, 200);
  assert.equal(result[0].exampleTranslation.length, 200);
  assert.equal(result[1].lemma.length, 60);
});
