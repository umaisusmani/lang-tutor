import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { TranslatableResult } from '@/app/components/chat/translatable-result';
import type { WordGloss } from '@/lib/gloss';

const house: WordGloss[number] = {
  word: 'Haus', lemma: 'Haus', lemmaTranslation: 'house', translation: 'house',
};
const garden: WordGloss[number] = {
  word: 'Garten', lemma: 'Garten', lemmaTranslation: 'garden', translation: 'garden',
};
const phrase: WordGloss[number] = {
  word: 'zum Beispiel', lemma: 'zum Beispiel', lemmaTranslation: 'for example', translation: 'for example',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(overrides: Partial<ComponentProps<typeof TranslatableResult>> = {}) {
  const props: ComponentProps<typeof TranslatableResult> = {
    text: 'Haus Garten',
    canSave: true,
    isSaved: vi.fn(() => false),
    onSaveWord: vi.fn(),
    onRemaining: vi.fn(),
    onAuthRequired: vi.fn(),
    ...overrides,
  };
  render(<TranslatableResult {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('starts with clickable tokens and no lookup', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setup();
  expect(screen.getByRole('button', { name: 'Haus' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Garten' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('looks up the full sentence on click, then opens the clicked word', async () => {
  let resolveFetch!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const props = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(screen.getByText('looking up…')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/translate/words', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ text: 'Haus Garten' }),
  }));
  resolveFetch(response({ units: [house, garden], remaining: 8 }));
  const popup = await screen.findByRole('dialog', { name: 'Haus: house' });
  expect(within(popup).getByText('house')).toBeInTheDocument();
  expect(within(popup).getByRole('button', { name: '+ save' })).toBeInTheDocument();
  expect(screen.queryByText('looking up…')).not.toBeInTheDocument();
  expect(props.onRemaining).toHaveBeenCalledWith(8);
});

test.each(['zum', 'Beispiel'])('either %s token opens the grouped phrase', async (clicked) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [phrase] })));
  setup({ text: 'zum Beispiel' });
  await userEvent.click(screen.getByRole('button', { name: clicked }));
  const popup = await screen.findByRole('dialog', { name: 'zum Beispiel: for example' });
  expect(within(popup).getByText('zum Beispiel')).toBeInTheDocument();
  expect(within(popup).getByText('for example')).toBeInTheDocument();
});

test('another word opens instantly after the shared lookup', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ units: [house, garden] }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await screen.findByRole('dialog', { name: 'Haus: house' });
  await userEvent.click(screen.getByRole('button', { name: 'Garten' }));
  expect(screen.getByRole('dialog', { name: 'Garten: garden' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('clicking a different token during lookup opens that token from the same response', async () => {
  let resolveFetch!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await userEvent.click(screen.getByRole('button', { name: 'Garten' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolveFetch(response({ units: [house, garden] }));
  expect(await screen.findByRole('dialog', { name: 'Garten: garden' })).toBeInTheDocument();
});

test('saving sends the grouped unit and full source text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [phrase] })));
  const props = setup({ text: 'zum Beispiel' });
  await userEvent.click(screen.getByRole('button', { name: 'Beispiel' }));
  await userEvent.click(await screen.findByRole('button', { name: '+ save' }));
  expect(props.onSaveWord).toHaveBeenCalledWith(phrase, 'new_word', 'zum Beispiel');
});

test('saved words have a disabled save button', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [house] })));
  setup({ isSaved: (lemma) => lemma === 'Haus' });
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(await screen.findByRole('button', { name: '✓ saved' })).toBeDisabled();
});

test('saving requires sign in', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [house] })));
  setup({ canSave: false });
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(await screen.findByRole('button', { name: 'sign in' })).toBeDisabled();
});

test('an error leaves tokens clickable for a retry', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ error: 'Try again later.' }, 503))
    .mockResolvedValueOnce(response({ units: [house] }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later.');
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(await screen.findByRole('dialog', { name: 'Haus: house' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('401 requests sign in', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ error: 'Sign in to use Translate.' }, 401));
  vi.stubGlobal('fetch', fetchMock);
  const props = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await waitFor(() => expect(props.onAuthRequired).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('tokens missing from the lookup become plain text', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [house] })));
  setup({ text: 'Haus !' });
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await screen.findByRole('dialog', { name: 'Haus: house' });
  expect(screen.getByText('!')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '!' })).not.toBeInTheDocument();
});

test('an empty lookup leaves plain text and clears the loading state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [] })));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Haus' })).not.toBeInTheDocument());
  expect(screen.getByText('Haus')).toBeInTheDocument();
  expect(screen.queryByText('looking up…')).not.toBeInTheDocument();
});

test('Escape and a pointer press outside close the popup', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ units: [house] })));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Haus' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.pointer({ keys: '[MouseLeft]', target: document.body });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
