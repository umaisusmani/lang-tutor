import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { VocabBrowser } from '@/app/vocab/vocab-browser';
import { discoverWordsAction, gradeCardAction, startSessionAction, type SessionCard } from '@/app/vocab/actions';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  discoverWordsAction: vi.fn(() => new Promise<never>(() => {})),
  startSessionAction: vi.fn(),
  searchStarterWordsAction: vi.fn(),
  previewStarterWordAction: vi.fn(),
  addStarterWordAction: vi.fn(),
  previewStarterWordsAction: vi.fn(),
  gradeCardAction: vi.fn(),
  undoReviewAction: vi.fn(),
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
  cleanup();
  localStorage.clear();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.clearAllMocks();
});

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, example_translation: null, note: null, source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};
const card: SessionCard = {
  id: 'card-1', direction: 'forward', lemma: 'Haus', translation: 'house', exampleSentence: null, exampleTranslation: null,
  schedule: { state: 0, due: '2026-10-31T00:00:00.000Z', stability: 0, difficulty: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, last_review: null },
};

test('discovering words only changes the Discover words loading label', () => {
  render(<VocabBrowser entries={[entry]} dueCount={1} dueWordIds={[entry.id]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);

  const reviewButton = screen.getByRole('button', { name: 'Review 1 due word' });
  const discoverButton = screen.getByRole('button', { name: 'Discover words' });
  fireEvent.click(discoverButton);

  expect(discoverButton).toHaveTextContent('Loading…');
  expect(reviewButton).toHaveTextContent('Review 1 due word');
});

test('the add-word button opens a dialog with a focused search field and resets on reopen', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  const trigger = screen.getByRole('button', { name: 'Add a word' });
  expect(screen.queryByRole('combobox', { name: 'Search for a word' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Add a word' });
  const input = within(dialog).getByRole('combobox', { name: 'Search for a word' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'Haus' } });
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Search for a word' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(within(screen.getByRole('dialog', { name: 'Add a word' })).getByRole('combobox', { name: 'Search for a word' })).toHaveValue('');
});

test('the add-word button is available with an empty vocabulary', () => {
  render(<VocabBrowser entries={[]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add a word' }));
  expect(within(screen.getByRole('dialog', { name: 'Add a word' })).getByRole('combobox', { name: 'Search for a word' })).toBeInTheDocument();
});

test('an empty vocabulary offers discovery and stores skips for this account', async () => {
  localStorage.clear();
  vi.mocked(discoverWordsAction).mockResolvedValueOnce([{ lemma: 'Haus', example: 'Das Haus.', exampleTranslation: 'The house.' }]);
  render(<VocabBrowser entries={[]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Discover words' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skip word' }));
  expect(localStorage.getItem('starfinch_skipped_words:user-1')).toBe('["Haus"]');
  expect(localStorage.getItem('starfinch_skipped_words')).toBeNull();
  expect(startSessionAction).not.toHaveBeenCalled();
});

test('backdrop click closes the add-word dialog', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add a word' }));
  fireEvent.click(screen.getByRole('dialog', { name: 'Add a word' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('the single primary button says Practice when nothing is due', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  expect(screen.getByRole('button', { name: 'Practice' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Extra practice|Review due words/ })).not.toBeInTheDocument();
});

test('finishing due words offers practice ahead in place', async () => {
  vi.mocked(startSessionAction)
    .mockResolvedValueOnce({ cards: [card], discover: [], extra: false })
    .mockResolvedValueOnce({ cards: [card], discover: [], extra: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  render(<VocabBrowser entries={[entry]} dueCount={1} dueWordIds={[entry.id]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review 1 due word' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep practising' }));
  await waitFor(() => expect(startSessionAction).toHaveBeenLastCalledWith('practice', []));
  expect(await screen.findByText('Practising ahead: nothing here is due yet.')).toBeInTheDocument();
});

test('a practice round returns to the list with a Practice summary', async () => {
  vi.mocked(startSessionAction).mockResolvedValue({ cards: [card], discover: [], extra: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} schedules={{}} userId="user-1" heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
  expect(await screen.findByText('Practising ahead: nothing here is due yet.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByRole('heading', { name: 'Practice complete' })).toBeInTheDocument();
  expect(screen.queryByText('All due words done.')).not.toBeInTheDocument();
});
