import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRef, type Ref } from 'react';

import { ToolsLauncher, type ToolsLauncherHandle } from '@/app/components/tools-launcher';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(ref?: Ref<ToolsLauncherHandle>) {
  render(<ToolsLauncher ref={ref} canSave isSaved={() => false} onSaveWord={vi.fn()}
    quota={{ remaining: 10, cap: 50, reason: null, resetsAt: '2026-11-05T00:00:00.000Z' }}
    onQuotaChange={vi.fn()} onQuotaRefresh={vi.fn().mockResolvedValue(undefined)}
    level="A2" remaining={10} onAuthRequired={vi.fn()} />);
}

test('standalone launcher opens Ask and Translate and closes', () => {
  setup();
  const trigger = screen.getByRole('button', { name: 'Open learning tools' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('tab', { name: 'ask' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'translate' }));
  expect(screen.getByRole('textbox', { name: 'Text to translate from English' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close learning panel' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('chat entry point can open directly on Translate', () => {
  const ref = createRef<ToolsLauncherHandle>();
  setup(ref);
  act(() => ref.current?.open('translate'));
  expect(screen.getByRole('tab', { name: 'translate' })).toHaveAttribute('aria-selected', 'true');
});
