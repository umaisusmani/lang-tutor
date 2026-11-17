import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { RichEditorImpl as RichEditor } from '@/app/notes/rich-editor-impl';

afterEach(cleanup);

function setup(value = '', onChange = vi.fn()) {
  const view = render(<RichEditor label="Test note" value={value} onChange={onChange} placeholder="Write here" />);
  return { onChange, ...view };
}

async function editor() {
  const box = await screen.findByRole('textbox', { name: 'Test note' });
  await screen.findByRole('button', { name: 'Bold' });
  return box;
}

function paste(target: HTMLElement, data: Record<string, string>) {
  fireEvent.paste(target, { clipboardData: { getData: (type: string) => data[type] ?? '', types: Object.keys(data) } });
}

const lastHtml = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as string;

test('shows the full formatting toolbar', async () => {
  setup();
  await editor();
  const toolbar = screen.getByRole('toolbar', { name: 'Note formatting' });
  for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Highlight', 'Heading 2', 'Heading 3', 'Bullet list',
    'Numbered list', 'Blockquote', 'Inline code', 'Code block', 'Link', 'Horizontal rule', 'Insert table', 'Undo', 'Redo', 'Clear formatting']) {
    expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
  }
});

test('initial value, including legacy notes, is loaded through the sanitizer', async () => {
  setup('<strong onclick="evil()">safe</strong><br>second\nthird');
  const box = await editor();
  expect(box.innerHTML).not.toContain('onclick');
  expect(box.querySelector('strong')).toHaveTextContent('safe');
  expect(box).toHaveTextContent('second');
});

test('typing emits sanitized html and the toolbar applies formatting', async () => {
  const { onChange } = setup();
  const box = await editor();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bold' }));
  await user.type(box, 'hello');
  await waitFor(() => expect(lastHtml(onChange)).toBe('<p><strong>hello</strong></p>'));
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
});

test('block tools make headings, lists and quotes', async () => {
  const { onChange } = setup('<p>item</p>');
  await editor();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bullet list' }));
  await waitFor(() => expect(lastHtml(onChange)).toBe('<ul><li><p>item</p></li></ul>'));
  await user.click(screen.getByRole('button', { name: 'Bullet list' }));
  await user.click(screen.getByRole('button', { name: 'Heading 2' }));
  await waitFor(() => expect(lastHtml(onChange)).toBe('<h2>item</h2>'));
  await user.click(screen.getByRole('button', { name: 'Heading 2' }));
  await user.click(screen.getByRole('button', { name: 'Blockquote' }));
  await waitFor(() => expect(lastHtml(onChange)).toBe('<blockquote><p>item</p></blockquote>'));
});

test('table controls appear only inside a table and add or remove rows and columns', async () => {
  const { onChange } = setup('<p>text</p>');
  await editor();
  const user = userEvent.setup();
  expect(screen.queryByRole('button', { name: 'Add row below' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Insert table' }));
  await waitFor(() => expect(lastHtml(onChange)).toContain('<table>'));
  const rows = () => (lastHtml(onChange).match(/<tr>/g) ?? []).length;
  const cols = () => (/<tr>(.*?)<\/tr>/.exec(lastHtml(onChange))?.[1].match(/<t[hd]>/g) ?? []).length;
  expect(rows()).toBe(3);
  expect(cols()).toBe(3);
  await user.click(await screen.findByRole('button', { name: 'Add row below' }));
  await waitFor(() => expect(rows()).toBe(4));
  await user.click(screen.getByRole('button', { name: 'Add column right' }));
  await waitFor(() => expect(cols()).toBe(4));
  await user.click(screen.getByRole('button', { name: 'Delete row' }));
  await waitFor(() => expect(rows()).toBe(3));
  await user.click(screen.getByRole('button', { name: 'Delete column' }));
  await waitFor(() => expect(cols()).toBe(3));
  await user.click(screen.getByRole('button', { name: 'Delete table' }));
  await waitFor(() => expect(lastHtml(onChange)).not.toContain('<table>'));
  expect(screen.queryByRole('button', { name: 'Add row below' })).not.toBeInTheDocument();
});

test('a link needs an allowed URL', async () => {
  const { onChange } = setup('<p>site</p>');
  const box = await editor();
  const user = userEvent.setup();
  await act(async () => {
    const range = document.createRange();
    range.selectNodeContents(box.querySelector('p')!);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  await user.click(screen.getByRole('button', { name: 'Link' }));
  const input = screen.getByLabelText('Link URL');
  await user.type(input, 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter an http(s) or mailto link.');
  expect(onChange).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, 'example.com/page');
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(lastHtml(onChange)).toContain('href="https://example.com/page" target="_blank" rel="noopener noreferrer"'));
});

test('pasting rendered HTML keeps a table and drops classes, styles and scripts', async () => {
  const { onChange } = setup();
  const box = await editor();
  paste(box, {
    'text/html': '<meta charset="utf-8"><div class="markdown"><table class="w-full" style="x"><thead><tr><th data-a="1">Case</th><th>Ending</th></tr></thead>'
      + '<tbody><tr><td><strong>Nom</strong></td><td>-er<script>alert(1)</script></td></tr></tbody></table></div>',
    'text/plain': 'Case\tEnding\nNom\t-er',
  });
  await waitFor(() => expect(lastHtml(onChange)).toContain('<table>'));
  const html = lastHtml(onChange);
  expect(html).toContain('<th><p>Case</p></th>');
  expect(html).toContain('<strong>Nom</strong>');
  expect(html).not.toMatch(/class=|style=|script|data-|alert/);
});

test('pasting a markdown table as plain text becomes a table with a header row', async () => {
  const { onChange } = setup();
  const box = await editor();
  paste(box, { 'text/plain': '| Case | Ending |\n| --- | :---: |\n| Nom | -er |\n| Akk | -en |' });
  await waitFor(() => expect(lastHtml(onChange)).toContain('<table>'));
  const html = lastHtml(onChange);
  expect(html).toMatch(/<th[^>]*>(<p>)?Case/);
  expect(html).toMatch(/<td[^>]*>(<p>)?Akk/);
  expect(html).not.toContain('---');
});

test('pasting markdown headings, lists and bold converts them', async () => {
  const { onChange } = setup();
  const box = await editor();
  paste(box, { 'text/plain': '## Haben\n\n- **ich** habe\n- du hast' });
  await waitFor(() => expect(lastHtml(onChange)).toContain('<h2>'));
  expect(lastHtml(onChange)).toContain('<ul>');
  expect(lastHtml(onChange)).toContain('<strong>ich</strong>');
});

test('pasting ordinary text is left to the browser', async () => {
  const { onChange } = setup();
  const box = await editor();
  paste(box, { 'text/plain': 'just a sentence' });
  await waitFor(() => expect(lastHtml(onChange)).toBe('<p>just a sentence</p>'));
});

test('an over-long note keeps its content, shows an alert and a counter', async () => {
  const { onChange } = setup('<p>short</p>');
  const box = await editor();
  expect(screen.getByText('5 / 5000')).toBeInTheDocument();
  paste(box, { 'text/html': `<p>${'x'.repeat(5001)}</p>` });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This note is too long.'));
  expect(lastHtml(onChange)).toContain('x'.repeat(5001));
  expect(screen.getByText(/ \/ 5000/)).toHaveTextContent(/^50\d\d \/ 5000$/);
});

test('an external value change replaces the content without echoing', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<RichEditor label="Test note" value="<p>one</p>" onChange={onChange} />);
  const box = await editor();
  rerender(<RichEditor label="Test note" value="<p>two</p>" onChange={onChange} />);
  await waitFor(() => expect(box).toHaveTextContent('two'));
  expect(onChange).not.toHaveBeenCalled();
});
