import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeTree, type TreeNode } from './sanitize-note-html';

test('allowed marks survive structurally without attributes', () => {
  const input: TreeNode[] = [{ tag: 'strong', children: [{ text: 'bold' }] }, { tag: 'br', children: [] }, { tag: 'u', children: [{ text: 'under' }] }];
  assert.deepEqual(sanitizeTree(input), input);
});

test('disallowed tags lose their wrapper but retain text', () => {
  assert.deepEqual(sanitizeTree([{ tag: 'span', children: [{ text: 'learner text' }] }]), [{ text: 'learner text' }]);
});

test('nested marks survive and blocks flatten to breaks', () => {
  assert.deepEqual(sanitizeTree([
    { tag: 'p', children: [{ tag: 'b', children: [{ tag: 'i', children: [{ text: 'first' }] }] }] },
    { tag: 'div', children: [{ text: 'second' }] },
  ]), [
    { tag: 'b', children: [{ tag: 'i', children: [{ text: 'first' }] }] },
    { tag: 'br', children: [] }, { text: 'second' },
  ]);
});

test('empty input stays empty', () => assert.deepEqual(sanitizeTree([]), []));

test('an explicit break remains in the sanitized tree', () => {
  assert.deepEqual(sanitizeTree([{ tag: 'br', children: [] }]), [{ tag: 'br', children: [] }]);
});

test('a blank block adds only one line break after a previous block', () => {
  assert.deepEqual(sanitizeTree([
    { tag: 'div', children: [{ text: 'line' }] },
    { tag: 'div', children: [{ tag: 'br', children: [] }] },
  ]), [{ text: 'line' }, { tag: 'br', children: [] }]);
});
