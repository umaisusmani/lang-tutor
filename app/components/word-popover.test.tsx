import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { WordPopover } from '@/app/components/word-popover';

function Fixture({ insideDialog = false }: { insideDialog?: boolean }) {
  const anchorRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const content = (
    <>
      <button onClick={(event) => { anchorRef.current = event.currentTarget; setOpen(true); }}>word</button>
      {open && (
        <WordPopover anchorRef={anchorRef} role="dialog" aria-label="word menu" className="border-line border-2">
          meaning
          <button onClick={() => setSaved(true)}>Save word</button>
        </WordPopover>
      )}
      {saved && <span>Saved</span>}
    </>
  );
  return insideDialog ? <dialog open aria-label="side panel">{content}</dialog> : content;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('clamps a menu inside the viewport, flips above, and follows inner scrolling', () => {
  let anchorTop = 745;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(this.tagName === 'BUTTON' ? 2 : 0, this.tagName === 'BUTTON' ? anchorTop : 0,
      this.tagName === 'BUTTON' ? 20 : 120, this.tagName === 'BUTTON' ? 20 : 80);
  });
  vi.stubGlobal('innerWidth', 200);
  vi.stubGlobal('innerHeight', 768);
  render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'word' }));
  const menu = screen.getByRole('dialog', { name: 'word menu' });
  expect(menu.parentElement).toBe(document.body);
  expect(menu).toHaveStyle({ left: '8px', top: '658px' });
  anchorTop = 20;
  fireEvent.scroll(window);
  expect(menu).toHaveStyle({ left: '8px', top: '47px' });
});

test('renders an open dialog anchor’s menu inside the dialog and keeps its button clickable', () => {
  render(<Fixture insideDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'word' }));
  const menu = screen.getByRole('dialog', { name: 'word menu' });
  expect(menu.parentElement).toBe(screen.getByRole('dialog', { name: 'side panel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save word' }));
  expect(screen.getByText('Saved')).toBeVisible();
});
