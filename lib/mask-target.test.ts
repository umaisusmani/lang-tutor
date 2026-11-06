import assert from 'node:assert/strict';
import test from 'node:test';
import { maskTarget } from './mask-target';

test('masks exact target words without hiding unrelated words', () => {
  assert.equal(maskTarget('Das Haus ist groß.', 'Haus'), 'Das ____ ist groß.');
  // Irregular inflection changes the stem, so best effort masking leaves it visible.
  assert.equal(maskTarget('Die Häuser sind groß.', 'Haus'), 'Die Häuser sind groß.');
});

test('masks a regular inflection using the stem', () => {
  assert.equal(maskTarget('Er geht nach Hause.', 'gehen'), 'Er ____ nach Hause.');
});

test('short lemmas match only a whole word', () => {
  assert.equal(maskTarget('Ab sofort fahren wir ab. Aber später.', 'ab'), '____ sofort fahren wir ____. Aber später.');
});
