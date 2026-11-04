import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderInlineFormat } from '@/lib/inline-format';

function html(text: string) {
  return renderToStaticMarkup(renderInlineFormat(text));
}

test('plain note text stays plain, including newlines', () => {
  assert.equal(html('A note\nwith two lines.'), 'A note\nwith two lines.');
});

test('renders bold and italic markers', () => {
  assert.equal(html('**bold**'), '<strong>bold</strong>');
  assert.equal(html('*italic*'), '<em>italic</em>');
  assert.equal(html('**bold** and *italic*'), '<strong>bold</strong> and <em>italic</em>');
});

test('keeps unmatched markers literal', () => {
  assert.equal(html('trailing *'), 'trailing *');
  assert.equal(html('trailing **'), 'trailing **');
  assert.equal(html('**unclosed'), '**unclosed');
});

test('handles adjacent and nested markers', () => {
  assert.equal(html('**bold**intact*italic*'), '<strong>bold</strong>intact<em>italic</em>');
  assert.equal(html('**bold *italic***'), '<strong>bold <em>italic</em></strong>');
});
