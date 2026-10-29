import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { TranslationWords } from '@/app/components/chat/translation-words';
import type { WordGloss } from '@/lib/gloss';

const unit: WordGloss[number] = {
  word: 'zum Beispiel',
  lemma: 'zum Beispiel',
  lemmaTranslation: 'for example',
  translation: 'for example',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(overrides: Partial<ComponentProps<typeof TranslationWords>> = {}) {
  const props: ComponentProps<typeof TranslationWords> = {
    germanText: 'Ich mag Obst, zum Beispiel Äpfel.',
    canSave: true,
    isSaved: vi.fn(() => false),
    onSaveWord: vi.fn(),
    onRemaining: vi.fn(),
    onAuthRequired: vi.fn(),
    ...overrides,
  };
  render(<TranslationWords {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('breaks down the German text after a click and shows the unit', async () => {
  let resolveFetch!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  setup();

  expect(screen.getByRole('button', { name: 'save words ↓' })).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Words to save' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(screen.getByText('breaking it down…')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'save words ↓' })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/translate/words', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ text: 'Ich mag Obst, zum Beispiel Äpfel.' }),
  }));

  resolveFetch(response({ units: [unit], remaining: 12 }));
  const list = await screen.findByRole('list', { name: 'Words to save' });
  expect(within(list).getByText('zum Beispiel')).toBeInTheDocument();
  expect(within(list).getByText('for example')).toBeInTheDocument();
});

test('saves a unit with its German source text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [unit] })));
  const props = setup();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  await userEvent.click(await screen.findByRole('button', { name: '+ save' }));
  expect(props.onSaveWord).toHaveBeenCalledOnce();
  expect(props.onSaveWord).toHaveBeenCalledWith(unit, 'new_word', 'Ich mag Obst, zum Beispiel Äpfel.');
});

test('shows saved units as disabled', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [unit] })));
  setup({ isSaved: (lemma) => lemma === 'zum Beispiel' });
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(await screen.findByRole('button', { name: '✓ saved' })).toBeDisabled();
});

test('shows disabled sign in buttons when saving is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [unit] })));
  setup({ canSave: false });
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(await screen.findByRole('button', { name: 'sign in' })).toBeDisabled();
});

test('shows an error and allows a retry', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ error: 'Try again later.' }, 503))
    .mockResolvedValueOnce(response({ units: [unit] }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later.');
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(await screen.findByText('zum Beispiel')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('requests sign in on 401', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Sign in to use Translate.' }, 401)));
  const props = setup();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  await waitFor(() => expect(props.onAuthRequired).toHaveBeenCalledOnce());
});

test('reports remaining translations', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [unit], remaining: 7 })));
  const props = setup();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  await waitFor(() => expect(props.onRemaining).toHaveBeenCalledWith(7));
});

test('shows an empty result message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [] })));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'save words ↓' }));
  expect(await screen.findByText('Nothing to save here.')).toBeInTheDocument();
});
