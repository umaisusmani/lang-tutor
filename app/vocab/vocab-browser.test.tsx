import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { VocabBrowser } from '@/app/vocab/vocab-browser';
import { gradeCardAction, startSessionAction, type SessionCard } from '@/app/vocab/actions';
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
}));
vi.mock('@/app/vocab/vocab-grid', () => ({ VocabGrid: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, note: null, source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};
const card: SessionCard = {
  id: 'card-1', direction: 'forward', lemma: 'Haus', translation: 'house', exampleSentence: null,
  schedule: { state: 0, due: '2026-10-31T00:00:00.000Z', stability: 0, difficulty: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, last_review: null },
};

test('discovering words only changes the Discover words loading label', () => {
  render(<VocabBrowser entries={[entry]} dueCount={1} dueWordIds={[entry.id]} heading={<h1>Vocabulary</h1>} />);

  const reviewButton = screen.getByRole('button', { name: 'Review 1 due word' });
  const discoverButton = screen.getByRole('button', { name: 'Discover words' });
  fireEvent.click(discoverButton);

  expect(discoverButton).toHaveTextContent('Loading…');
  expect(reviewButton).toHaveTextContent('Review 1 due word');
});

test('the add-word field is visible with saved entries', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} heading={<h1>Vocabulary</h1>} />);
  expect(screen.getByRole('combobox', { name: 'Add a word' })).toBeInTheDocument();
});

test('the add-word field is visible with an empty vocabulary', () => {
  render(<VocabBrowser entries={[]} dueCount={0} dueWordIds={[]} heading={<h1>Vocabulary</h1>} />);
  expect(screen.getByRole('combobox', { name: 'Add a word' })).toBeInTheDocument();
});

test('mobile Add a word toggle controls the panel', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} heading={<h1>Vocabulary</h1>} />);
  const toggle = screen.getByRole('button', { name: 'Add a word' });
  const panel = document.getElementById('add-word-panel');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(panel).toHaveClass('hidden', 'sm:block');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(panel).not.toHaveClass('hidden');
  expect(screen.getByRole('combobox', { name: 'Add a word' })).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(panel).toHaveClass('hidden');
});

test('the single primary button says Practice when nothing is due', () => {
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} heading={<h1>Vocabulary</h1>} />);
  expect(screen.getByRole('button', { name: 'Practice' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Extra practice|Review due words/ })).not.toBeInTheDocument();
});

test('finishing due words offers practice ahead in place', async () => {
  vi.mocked(startSessionAction)
    .mockResolvedValueOnce({ cards: [card], discover: [], extra: false })
    .mockResolvedValueOnce({ cards: [card], discover: [], extra: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { state: 1, due: '2026-11-01T00:00:00.000Z' } } as Awaited<ReturnType<typeof gradeCardAction>>);
  render(<VocabBrowser entries={[entry]} dueCount={1} dueWordIds={[entry.id]} heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review 1 due word' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /GoodI knew it/ }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep practising' }));
  await waitFor(() => expect(startSessionAction).toHaveBeenLastCalledWith('practice', []));
  expect(await screen.findByText('Practising ahead: nothing here is due yet.')).toBeInTheDocument();
});

test('a practice round returns to the list with a Practice summary', async () => {
  vi.mocked(startSessionAction).mockResolvedValue({ cards: [card], discover: [], extra: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { state: 1, due: '2026-11-01T00:00:00.000Z' } } as Awaited<ReturnType<typeof gradeCardAction>>);
  render(<VocabBrowser entries={[entry]} dueCount={0} dueWordIds={[]} heading={<h1>Vocabulary</h1>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
  expect(await screen.findByText('Practising ahead: nothing here is due yet.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /GoodI knew it/ }));
  expect(await screen.findByRole('heading', { name: 'Practice complete' })).toBeInTheDocument();
  expect(screen.queryByText('All due words done.')).not.toBeInTheDocument();
});
