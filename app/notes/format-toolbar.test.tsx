import { createRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { FormatToolbar } from '@/app/notes/format-toolbar';

afterEach(cleanup);

function Editor({ initial = 'hello world' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [ref] = useState(() => createRef<HTMLTextAreaElement>());
  return <>
    <FormatToolbar textareaRef={ref} value={value} onChange={setValue} />
    <textarea ref={ref} aria-label="Note" value={value} onChange={(event) => setValue(event.target.value)} />
  </>;
}

test.each([
  ['Bold', '**'],
  ['Italic', '*'],
] as const)('%s wraps the current selection', async (button, marker) => {
  render(<Editor />);
  const textarea = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement;
  textarea.setSelectionRange(6, 11);
  fireEvent.click(screen.getByRole('button', { name: button }));
  expect(textarea).toHaveValue(`hello ${marker}world${marker}`);
  await waitFor(() => expect(textarea.selectionStart).toBe(6 + marker.length));
  expect(textarea.selectionEnd).toBe(11 + marker.length);
  expect(textarea).toHaveFocus();
});

test.each([
  ['Bold', '**', 'bold text'],
  ['Italic', '*', 'italic text'],
] as const)('%s inserts a selected placeholder at the cursor', async (button, marker, placeholder) => {
  render(<Editor />);
  const textarea = screen.getByRole('textbox', { name: 'Note' }) as HTMLTextAreaElement;
  textarea.setSelectionRange(5, 5);
  fireEvent.click(screen.getByRole('button', { name: button }));
  expect(textarea).toHaveValue(`hello${marker}${placeholder}${marker} world`);
  await waitFor(() => expect(textarea.selectionStart).toBe(5 + marker.length));
  expect(textarea.selectionEnd).toBe(5 + marker.length + placeholder.length);
  expect(textarea).toHaveFocus();
});
