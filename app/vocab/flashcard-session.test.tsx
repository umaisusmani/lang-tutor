import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { FlashcardSession } from '@/app/vocab/flashcard-session';
import { addStarterWordAction, gradeCardAction, previewStarterWordsAction, type SessionCard } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({ gradeCardAction: vi.fn(), previewStarterWordsAction: vi.fn(), addStarterWordAction: vi.fn() }));
afterEach(cleanup);

const card: SessionCard = {
  id: 'card-1', direction: 'forward', lemma: 'Haus', translation: 'house', exampleSentence: 'Das Haus ist groß.',
  schedule: { state: 0, due: '2026-10-31T00:00:00.000Z', stability: 0, difficulty: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, last_review: null },
};

test('review progress and sentence hint respond to grading and checkbox input', async () => {
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { state: 1, due: '2026-11-01T00:00:00.000Z' } } as Awaited<ReturnType<typeof gradeCardAction>>);
  const onFinish = vi.fn();
  render(<FlashcardSession initialCards={[card]} discover={[]} extra={false} onFinish={onFinish} onReload={vi.fn()} onKeepPractising={vi.fn()} onSkip={vi.fn()} />);
  const progress = screen.getByRole('progressbar', { name: 'Review progress' });
  expect(progress).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show sentence hint' }));
  expect(screen.getByText('Das Haus ist groß.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /GoodI knew it/ }));
  await waitFor(() => expect(screen.getByText('All due words done.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Back to my words' }));
  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ reviewed: 1, added: 0 }));
  expect(progress).toHaveAttribute('aria-valuenow', '1');
});


test('a new word appears after three reviews with its batched meaning and can be added', async () => {
  let resolveMeanings!: (result: Record<string, string>) => void;
  vi.mocked(previewStarterWordsAction).mockReturnValue(new Promise((resolve) => { resolveMeanings = resolve; }));
  vi.mocked(addStarterWordAction).mockResolvedValue({ ok: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { state: 1, due: '2026-11-01T00:00:00.000Z' } } as Awaited<ReturnType<typeof gradeCardAction>>);
  const cards = [card, { ...card, id: 'card-2' }, { ...card, id: 'card-3' }];
  const word = { lemma: 'der Bahnhof', example: 'Der Zug kommt an.', exampleTranslation: 'The train arrives.' };
  render(<FlashcardSession initialCards={cards} discover={[word]} extra={false} onFinish={vi.fn()}
    onReload={vi.fn()} onKeepPractising={vi.fn()} onSkip={vi.fn()} />);
  await waitFor(() => expect(previewStarterWordsAction).toHaveBeenCalledWith(['der Bahnhof']));
  for (let index = 0; index < 3; index++) {
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /GoodI knew it/ }));
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(index + 1)));
  }
  expect(screen.getByText('New word')).toBeInTheDocument();
  expect(screen.getByText('Loading meaning…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add to my words' })).toBeDisabled();
  await act(async () => { resolveMeanings({ 'der Bahnhof': 'station' }); });
  expect(screen.getByText('station')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my words' }));
  await waitFor(() => expect(addStarterWordAction).toHaveBeenCalledWith('der Bahnhof', 'station'));
  expect(await screen.findByText('1 new word added.')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4');
});
