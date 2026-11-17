import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isNoteWithinLimits, noteHtmlToPlainText, noteTextToHtml, normalizeLegacyNoteHtml,
  sanitizeTree, serializeTree, NOTE_PLAIN_MAX, type TreeNode,
} from './sanitize-note-html';

const t = (text: string): TreeNode => ({ text });
const el = (tag: string, children: TreeNode[] = [], attrs?: Record<string, string>): TreeNode =>
  attrs ? { tag, attrs, children } : { tag, children };

test('allowed marks survive structurally without attributes', () => {
  const input = [el('strong', [t('bold')]), el('br'), el('u', [t('under')])];
  assert.deepEqual(sanitizeTree(input), input);
});

test('legacy tags are normalized', () => {
  assert.deepEqual(sanitizeTree([el('b', [el('i', [t('x')])]), el('strike', [t('y')])]),
    [el('strong', [el('em', [t('x')])]), el('s', [t('y')])]);
});

test('unknown wrappers are unwrapped and keep their text', () => {
  assert.deepEqual(sanitizeTree([el('span', [t('learner text')], { style: 'color:red' })]), [t('learner text')]);
});

test('script and style content is dropped entirely', () => {
  assert.deepEqual(sanitizeTree([el('script', [t('alert(1)')]), el('style', [t('p{}')]), t('ok')]), [t('ok')]);
});

test('blocks are kept and divs become paragraphs', () => {
  assert.deepEqual(sanitizeTree([el('div', [t('one')]), el('h1', [t('Title')]), el('h5', [t('Small')])]),
    [el('p', [t('one')]), el('h2', [t('Title')]), el('h3', [t('Small')])]);
});

test('empty blocks and marks vanish', () => {
  assert.deepEqual(sanitizeTree([el('p', [el('br')]), el('strong'), el('ul')]), []);
});

test('tables keep their structure and cell spans, and drop other attributes', () => {
  const input = [el('table', [
    el('thead', [el('tr', [el('th', [t('A')], { colspan: '2', style: 'x' })])]),
    t('\n'),
    el('tbody', [el('tr', [el('td', [t('1')], { rowspan: '99' }), el('td', [])])]),
  ], { class: 'x' })];
  assert.deepEqual(sanitizeTree(input), [el('table', [
    el('thead', [el('tr', [el('th', [t('A')], { colspan: '2' })])]),
    el('tbody', [el('tr', [el('td', [t('1')], { rowspan: '20' }), el('td', [])])]),
  ])]);
});

test('stray list items, rows and cells are unwrapped', () => {
  assert.deepEqual(sanitizeTree([el('li', [t('a')]), el('td', [t('b')]), el('tr', [t('c')])]), [t('a'), t('b'), t('c')]);
});

test('a table without rows is unwrapped; a nested table is flattened', () => {
  assert.deepEqual(sanitizeTree([el('table', [t('only text')])]), [t('only text')]);
  const nested = sanitizeTree([el('table', [el('tr', [el('td', [el('table', [el('tr', [el('td', [t('inner')])])])])])])]);
  assert.equal(serializeTree(nested), '<table><tr><td>inner</td></tr></table>');
});

test('links keep only safe hrefs and gain rel/target on serialization', () => {
  const ok = sanitizeTree([el('a', [t('site')], { href: ' https://example.com/a?b=1&c=2 ', onclick: 'x()' })]);
  assert.equal(serializeTree(ok), '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site</a>');
  for (const href of ['javascript:alert(1)', 'JaVa\tScRiPt:alert(1)', ' java\nscript:x', 'data:text/html,x', 'vbscript:x', '/relative', '//evil.com', '']) {
    assert.deepEqual(sanitizeTree([el('a', [t('x')], { href })]), [t('x')], href);
  }
});

test('pre keeps its text exactly, wrapped in code, with nested markup flattened', () => {
  const tree = sanitizeTree([el('pre', [el('code', [t('a  b\n  c'), el('span', [t('<d>')])])])]);
  assert.equal(serializeTree(tree), '<pre><code>a  b\n  c&lt;d&gt;</code></pre>');
});

test('blocks inside inline marks or paragraphs are unwrapped', () => {
  assert.deepEqual(sanitizeTree([el('strong', [el('ul', [el('li', [t('x')])])])]), [el('strong', [t('x')])]);
  assert.deepEqual(sanitizeTree([el('p', [el('p', [t('x')])])]), [el('p', [t('x')])]);
});

test('whitespace collapses, and source whitespace around blocks is dropped', () => {
  assert.deepEqual(sanitizeTree([t('\n  '), el('p', [t('  a \n b  ')]), t('\n'), el('ul', [t('\n'), el('li', [t('x')]), t('\n')])]),
    [el('p', [t('a b')]), el('ul', [el('li', [t('x')])])]);
});

test('very deep nesting is flattened', () => {
  let node: TreeNode = t('deep');
  for (let i = 0; i < 40; i++) node = el('blockquote', [node]);
  assert.match(serializeTree(sanitizeTree([node])), /deep/);
  assert.ok(serializeTree(sanitizeTree([node])).split('<blockquote>').length <= 10);
});

test('sanitizing is idempotent', () => {
  const tree = sanitizeTree([el('div', [el('b', [t('x')]), el('a', [t('l')], { href: 'https://e.com' })]),
    el('table', [el('tr', [el('th', [t('h')]), el('td', [el('p', [t('c')])])])]), el('ul', [el('li', [t('i')])])]);
  assert.deepEqual(sanitizeTree(tree), tree);
});

test('legacy plain newlines become breaks only when there are no blocks', () => {
  assert.equal(normalizeLegacyNoteHtml('a\nb'), 'a<br>b');
  assert.equal(normalizeLegacyNoteHtml('<p>a\nb</p>'), '<p>a\nb</p>');
  assert.equal(noteTextToHtml('a <b>\r\nb'), 'a &lt;b&gt;<br>b');
});

test('plain-text conversion separates blocks and cells', () => {
  assert.equal(noteHtmlToPlainText('<p>a</p><ul><li>b</li></ul><table><tr><td>c</td><td>d &amp; e</td></tr></table>').trim(), 'a\nb\nc d & e');
  assert.equal(noteHtmlToPlainText('<table><tr><td></td></tr></table><hr>').trim(), '');
});

test('limits are checked on plain length and stored size', () => {
  assert.equal(isNoteWithinLimits('x'.repeat(NOTE_PLAIN_MAX)), true);
  assert.equal(isNoteWithinLimits('x'.repeat(NOTE_PLAIN_MAX + 1)), false);
  assert.equal(isNoteWithinLimits(`<p>${'<strong>x</strong>'.repeat(2500)}</p>`), false);
});
