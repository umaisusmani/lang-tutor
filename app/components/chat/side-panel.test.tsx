import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ChatSidePanel } from '@/app/components/chat/side-panel';

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else delete (HTMLDialogElement.prototype as { showModal?: () => void }).showModal;
  if (scrollToDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollToDescriptor);
  else delete (HTMLElement.prototype as { scrollTo?: () => void }).scrollTo;
  vi.unstubAllGlobals();
});

function setup() {
  render(
    <ChatSidePanel
      open
      messages={[]}
      level="A1"
      remaining={10}
      canSave
      isSaved={() => false}
      onSaveWord={vi.fn()}
      quota={{ remaining: 10, cap: 50, reason: null, resetsAt: '2026-11-02T00:00:00.000Z' }}
      onQuotaChange={vi.fn()}
      onQuotaRefresh={vi.fn().mockResolvedValue(undefined)}
      onAuthRequired={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return userEvent.click(screen.getByRole('tab', { name: 'translate' }));
}

test('clear empties the draft and result and restores focus', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    translation: 'laufen',
    entry: { word: 'laufen', lemma: 'laufen', translation: 'to run', lemmaTranslation: 'to run' },
  }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await setup();
  const textarea = screen.getByRole('textbox', { name: 'Text to translate from English' });
  const clear = screen.getByRole('button', { name: 'clear' });
  expect(clear).toBeDisabled();
  await userEvent.type(textarea, 'run');
  await userEvent.click(screen.getByRole('button', { name: 'translate ↗' }));
  expect(await screen.findByRole('button', { name: 'laufen' })).toBeInTheDocument();
  await userEvent.click(clear);
  expect(textarea).toHaveValue('');
  expect(textarea).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'laufen' })).not.toBeInTheDocument();
  expect(screen.getByText('Your translation appears here.')).toBeInTheDocument();
  expect(clear).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('clear cancels an in-flight translation and ignores its late response', async () => {
  let resolveFetch!: (response: Response) => void;
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await setup();
  const textarea = screen.getByRole('textbox', { name: 'Text to translate from English' });
  await userEvent.type(textarea, 'run');
  await userEvent.click(screen.getByRole('button', { name: 'translate ↗' }));
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  await userEvent.click(screen.getByRole('button', { name: 'clear' }));
  expect(signal.aborted).toBe(true);
  resolveFetch(new Response(JSON.stringify({ translation: 'laufen' }), { status: 200 }));
  await waitFor(() => expect(screen.getByText('Your translation appears here.')).toBeInTheDocument());
  expect(textarea).toHaveValue('');
  expect(screen.queryByText('laufen')).not.toBeInTheDocument();
});

test('clear removes an opened word breakdown', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ translation: 'Haus' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ units: [
      { word: 'Haus', lemma: 'Haus', translation: 'house', lemmaTranslation: 'house' },
    ] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await setup();
  await userEvent.type(screen.getByRole('textbox', { name: 'Text to translate from English' }), 'house');
  await userEvent.click(screen.getByRole('button', { name: 'translate ↗' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Haus' }));
  expect(await screen.findByRole('dialog', { name: 'Haus: house' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'clear' }));
  expect(screen.queryByRole('dialog', { name: 'Haus: house' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Haus' })).not.toBeInTheDocument();
});
