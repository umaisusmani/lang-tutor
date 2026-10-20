import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReviewWords } from './review-session';

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
