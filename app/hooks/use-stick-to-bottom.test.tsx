import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { useStickToBottom } from '@/app/hooks/use-stick-to-bottom';

let height = 400;
let clientHeight = 200;
let top = 0;
let resize: () => void;
let observed: Element[];

function Harness({ messageCount }: { messageCount: number }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { scrollerRef, contentRef, hasNewMessage, onScroll, scrollToBottom } = useStickToBottom(messageCount);
  return (
    <>
      <div
        data-testid="scroller"
        ref={(element) => {
          if (!element) return;
          Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => height });
          Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => clientHeight });
          Object.defineProperty(element, 'scrollTop', {
            configurable: true,
            get: () => top,
            set: (value: number) => { top = Math.max(0, value - clientHeight); },
          });
          Object.defineProperty(element, 'scrollTo', {
            configurable: true,
            value: ({ top: nextTop }: ScrollToOptions) => { top = (nextTop ?? 0) - clientHeight; },
          });
          scrollerRef.current = element;
        }}
        onScroll={onScroll}
      >
        <div ref={contentRef}>
          thread
          <button onClick={() => setPanelOpen(true)}>Explain</button>
          {panelOpen && <div>Explanation</div>}
        </div>
      </div>
      {hasNewMessage && <button onClick={() => scrollToBottom('smooth')}>↓ new message</button>}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  height = 400;
  clientHeight = 200;
  top = 0;
});

function setup(messageCount = 1) {
  observed = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe(element: Element) { observed.push(element); }
    disconnect() {}
  });
  const view = render(<Harness messageCount={messageCount} />);
  return {
    scroller: screen.getByTestId('scroller'),
    setMessageCount: (count: number) => view.rerender(<Harness messageCount={count} />),
  };
}

test('starts at the bottom and follows content growth while there', () => {
  const { scroller } = setup();
  expect(scroller.scrollTop).toBe(200);
  act(() => { height = 500; resize(); });
  expect(scroller.scrollTop).toBe(300);
  expect(screen.queryByRole('button', { name: '↓ new message' })).not.toBeInTheDocument();
});

test('opening an explanation while scrolled up does not offer a new-message pill', () => {
  const { scroller } = setup();
  top = 50;
  fireEvent.scroll(scroller);
  fireEvent.click(screen.getByRole('button', { name: 'Explain' }));
  act(() => { height = 500; resize(); });
  expect(screen.getByText('Explanation')).toBeInTheDocument();
  expect(scroller.scrollTop).toBe(50);
  expect(screen.queryByRole('button', { name: '↓ new message' })).not.toBeInTheDocument();
});

test('a new message while scrolled up offers a way to re-stick', () => {
  const { scroller, setMessageCount } = setup();
  top = 50;
  fireEvent.scroll(scroller);
  act(() => { height = 500; resize(); });
  setMessageCount(2);
  expect(scroller.scrollTop).toBe(50);
  fireEvent.click(screen.getByRole('button', { name: '↓ new message' }));
  expect(scroller.scrollTop).toBe(300);
  expect(screen.queryByRole('button', { name: '↓ new message' })).not.toBeInTheDocument();
  act(() => { height = 600; resize(); });
  expect(scroller.scrollTop).toBe(400);
});

test('re-sticks when the scroller shrinks while at the bottom', () => {
  const { scroller } = setup();
  expect(observed).toContain(scroller);
  expect(scroller.scrollTop).toBe(200);
  act(() => { clientHeight = 150; resize(); });
  expect(scroller.scrollTop).toBe(250);
});

test('a wheel event interrupts smooth scrolling so later content growth leaves the reader in place', () => {
  const { scroller, setMessageCount } = setup();
  top = 50;
  fireEvent.scroll(scroller);
  setMessageCount(2);
  fireEvent.click(screen.getByRole('button', { name: '↓ new message' }));
  top = 100;
  fireEvent.scroll(scroller);
  fireEvent.wheel(scroller);
  top = 50;
  fireEvent.scroll(scroller);
  act(() => { height = 500; resize(); });
  expect(scroller.scrollTop).toBe(50);
  expect(screen.queryByRole('button', { name: '↓ new message' })).not.toBeInTheDocument();
});
