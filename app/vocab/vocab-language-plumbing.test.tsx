import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { VocabBrowser } from '@/app/vocab/vocab-browser';
import { lookupWordsAction, searchStarterWordsAction } from '@/app/vocab/actions';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/vocab/actions', () => ({
  lookupWordsAction: vi.fn(),
  searchStarterWordsAction: vi.fn(),
}));
vi.mock('@/app/vocab/vocab-grid', () => ({ VocabGrid: () => null }));

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
});
afterEach(() => {
  cleanup(); vi.clearAllMocks();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, example_translation: null, note: null, source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

test.each([{ entries: [] }, { entries: [entry] }])('hides Discover when starter vocabulary is empty', ({ entries }) => {
  render(<VocabBrowser entries={entries} dueCount={0} dueWordIds={[]} userId="user-1"
    heading={<h1>Vocabulary</h1>} hasStarterWords={false} />);
  expect(screen.queryByRole('button', { name: 'Discover words' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a word' })).toBeInTheDocument();
});

test('an empty starter list sends unmatched add-word searches to model lookup', async () => {
  vi.mocked(searchStarterWordsAction).mockResolvedValue([]);
  vi.mocked(lookupWordsAction).mockResolvedValue({ words: [{ lemma: 'Haus', meaning: 'house', example: 'Das Haus.', exampleTranslation: 'The house.' }] });
  render(<VocabBrowser entries={[]} dueCount={0} dueWordIds={[]} userId="user-1"
    heading={<h1>Vocabulary</h1>} hasStarterWords={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add a word' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search for a word' }), { target: { value: 'Haus' } });
  await waitFor(() => expect(lookupWordsAction).toHaveBeenCalledWith('Haus'));
  expect(await screen.findByRole('option', { name: /Haus.*house/ })).toBeInTheDocument();
});
