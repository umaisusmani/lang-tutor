import assert from 'node:assert/strict';
import { test } from 'node:test';

import { changedWordIndices, sentenceContaining, stripPunctuation } from '@/lib/text';

test('stripPunctuation keeps umlauts and inner characters', () => {
  assert.equal(stripPunctuation('„Grüße!"'), 'Grüße');
});

test('changedWordIndices marks only the corrected words', () => {
  assert.deepEqual([...changedWordIndices('Ich fahre mit den Bus.', 'Ich fahre mit dem Bus.')], [3]);
});

test('sentenceContaining picks the sentence with the word', () => {
  assert.equal(
    sentenceContaining('Hallo! Ich rufe dich morgen an. Bis dann.', 'rufe'),
    'Ich rufe dich morgen an.',
  );
});
