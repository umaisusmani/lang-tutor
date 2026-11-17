import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeNoteHtmlServer } from './sanitize-note-html.server';

test('a ChatGPT-style table keeps its structure and loses classes, styles and data attributes', () => {
  const html = '<div class="markdown prose"><table class="min-w-full" data-start="1"><thead><tr><th style="text-align:left" data-col-size="md">Case</th><th>Ending</th></tr></thead>'
    + '<tbody><tr><td><strong>Nom</strong></td><td>-er</td></tr></tbody></table></div>';
  assert.equal(sanitizeNoteHtmlServer(html),
    '<table><thead><tr><th>Case</th><th>Ending</th></tr></thead><tbody><tr><td><strong>Nom</strong></td><td>-er</td></tr></tbody></table>');
});

test('script, style, event handlers and dangerous links are neutralized', () => {
  const out = sanitizeNoteHtmlServer('<p onclick="x()">hi<script>alert(1)</script><style>p{}</style><img src=x onerror=alert(1)>'
    + '<a href="javascript:alert(1)">bad</a><a href="HTTPS://ok.example">good</a></p>');
  assert.equal(out, '<p>hibad<a href="HTTPS://ok.example" target="_blank" rel="noopener noreferrer">good</a></p>');
  assert.doesNotMatch(out, /script|onerror|onclick|javascript|style/i);
});

test('entities and angle brackets in text are escaped', () => {
  assert.equal(sanitizeNoteHtmlServer('<p>a &lt;b&gt; &amp; c</p>'), '<p>a &lt;b&gt; &amp; c</p>');
});

test('lists, headings, quotes and code blocks survive', () => {
  assert.equal(sanitizeNoteHtmlServer('<h1>T</h1><ul><li>a</li><li>b</li></ul><blockquote><p>q</p></blockquote><pre><code class="language-js">x = 1\n</code></pre>'),
    '<h2>T</h2><ul><li>a</li><li>b</li></ul><blockquote><p>q</p></blockquote><pre><code>x = 1</code></pre>');
});

test('stored legacy notes with raw newlines keep their line breaks', () => {
  assert.equal(sanitizeNoteHtmlServer('line1\nline2'), 'line1<br>line2');
  assert.equal(sanitizeNoteHtmlServer('<strong>bold</strong><br>x'), '<strong>bold</strong><br>x');
});

test('server output is stable when sanitized again', () => {
  const once = sanitizeNoteHtmlServer('<table><tr><th>A<th>B<tr><td>1<td>2</table><p>x <b>y</b></p>');
  assert.equal(sanitizeNoteHtmlServer(once), once);
});
