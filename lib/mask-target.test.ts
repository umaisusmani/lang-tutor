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

test('suffixing masks exact short lemmas without matching longer words', () => {
  assert.equal(maskTarget('ev evet', 'ev', 'suffixing'), '____ evet');
});

test('suffixing masks forms sharing a long stem', () => {
  assert.equal(maskTarget('kitap kitaplar', 'kitap', 'suffixing'), '____ ____');
  assert.equal(maskTarget('gitmek gitti', 'gitmek', 'suffixing'), '____ ____');
});
