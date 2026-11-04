import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { RichEditor } from '@/app/notes/rich-editor';

afterEach(cleanup);

test('initial HTML and edits are parsed through the sanitizer', () => {
  const onChange = vi.fn();
  render(<RichEditor label="Test note" value={'<strong onclick="evil()">safe</strong>'} onChange={onChange} />);
  const editor = screen.getByRole('textbox', { name: 'Test note' });
  expect(editor.innerHTML).toBe('<strong>safe</strong>');
  editor.innerHTML = '<span style="color:red"><u>under</u></span>';
  fireEvent.input(editor);
  expect(onChange).toHaveBeenLastCalledWith('<u>under</u>');
});

test('an edit exceeding 500 plain characters restores the last valid snapshot', () => {
  const onChange = vi.fn();
  render(<RichEditor label="Test note" value="short" onChange={onChange} />);
  const editor = screen.getByRole('textbox', { name: 'Test note' });
  editor.textContent = 'x'.repeat(501);
  fireEvent.input(editor);
  expect(editor).toHaveTextContent('short');
  expect(onChange).not.toHaveBeenCalled();
});

test('toolbar buttons call the browser formatting command', () => {
  const command = vi.fn();
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command });
  render(<RichEditor label="Test note" value="text" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
  expect(command.mock.calls.map(([name]) => name)).toEqual(['bold', 'italic', 'underline']);
});
