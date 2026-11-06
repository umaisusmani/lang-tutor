import assert from 'node:assert/strict';
import test from 'node:test';
import { pickNewWords, selectReviewWords } from './review-session';

test('review counts and sessions use one direction per word', () => {
  const first = { id: 'forward', vocab_entry_id: 'word', vocab_entry: { translation: 'hello' } };
  const other = { id: 'reverse', vocab_entry_id: 'word', vocab_entry: { translation: 'hello' } };
  const second = { id: 'second', vocab_entry_id: 'second-word', vocab_entry: { translation: 'thanks' } };
  assert.deepEqual(selectReviewWords([first, other, second]), [first, second]);
});

test('unusable cards cannot be counted or graded, and do not hide a usable sibling', () => {
  const missing = { id: 'missing', vocab_entry_id: 'word', vocab_entry: { translation: ' ' } };
  const usable = { id: 'usable', vocab_entry_id: 'word', vocab_entry: { translation: 'hello' } };
  const grammar = { id: 'grammar', vocab_entry_id: null, vocab_entry: null };
  assert.deepEqual(selectReviewWords([missing, grammar, usable]), [usable]);
});

test('session new-word caps and practice offsets count words after burying siblings', () => {
  const cards = Array.from({ length: 12 }, (_, index) => [
    { id: `forward-${index}`, vocab_entry_id: `word-${index}`, vocab_entry: { translation: 'hello' } },
    { id: `reverse-${index}`, vocab_entry_id: `word-${index}`, vocab_entry: { translation: 'hello' } },
  ]).flat();
  const first = pickNewWords(cards, new Set<string>(), 5);
  assert.deepEqual(first.map((card) => card.vocab_entry_id),
    ['word-0', 'word-1', 'word-2', 'word-3', 'word-4']);

  const reviewed = new Set(first.map((card) => card.vocab_entry_id as string));
  assert.deepEqual(pickNewWords(cards, reviewed, 5).map((card) => card.vocab_entry_id),
    ['word-5', 'word-6', 'word-7', 'word-8', 'word-9']);
  assert.deepEqual(pickNewWords(cards, new Set<string>(), 2, 5).map((card) => card.vocab_entry_id),
    ['word-5', 'word-6']);
});
