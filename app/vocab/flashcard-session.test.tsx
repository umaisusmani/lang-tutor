import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { FlashcardSession } from '@/app/vocab/flashcard-session';
import { addStarterWordAction, gradeCardAction, previewStarterWordsAction, undoReviewAction, type SessionCard } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({ gradeCardAction: vi.fn(), undoReviewAction: vi.fn(), previewStarterWordsAction: vi.fn(), addStarterWordAction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

const card: SessionCard = {
  id: 'card-1', direction: 'forward', lemma: 'Haus', translation: 'house', exampleSentence: 'Das Haus ist groß.', exampleTranslation: 'The house is big.',
  schedule: { state: 0, due: '2026-10-31T00:00:00.000Z', stability: 0, difficulty: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, last_review: null },
};

test('review progress and sentence hint respond to grading and checkbox input', async () => {
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  const onFinish = vi.fn();
  render(<FlashcardSession initialCards={[card]} discover={[]} extra={false} onFinish={onFinish} onReload={vi.fn()} onKeepPractising={vi.fn()} onSkip={vi.fn()} />);
  const progress = screen.getByRole('progressbar', { name: 'Review progress' });
  expect(progress).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show sentence hint' }));
  expect(screen.getByText('Das ____ ist groß.')).toBeInTheDocument();
  expect(screen.queryByText('The house is big.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('Das Haus ist groß.')).toBeInTheDocument();
  expect(screen.getByText('The house is big.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  await waitFor(() => expect(screen.getByText('All due words done.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Back to my words' }));
  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ reviewed: 1, added: 0 }));
  expect(progress).toHaveAttribute('aria-valuenow', '1');
});

test('the example translation appears after reveal in both directions, and is absent when unavailable', () => {
  const props = { discover: [], extra: false, onFinish: vi.fn(), onReload: vi.fn(), onKeepPractising: vi.fn(), onSkip: vi.fn() };
  const { rerender } = render(<FlashcardSession initialCards={[card]} {...props} />);
  expect(screen.queryByText('The house is big.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('The house is big.')).toBeInTheDocument();

  rerender(<FlashcardSession key="reverse" initialCards={[{ ...card, direction: 'reverse' }]} {...props} />);
  expect(screen.queryByText('The house is big.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByText('The house is big.')).toBeInTheDocument();

  rerender(<FlashcardSession key="without-translation" initialCards={[{ ...card, exampleTranslation: null }]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.queryByText('The house is big.')).not.toBeInTheDocument();
  expect(screen.getByText('Das Haus ist groß.')).toBeInTheDocument();
});


test('a new word appears after three reviews with its batched meaning and can be added', async () => {
  let resolveMeanings!: (result: Record<string, string>) => void;
  vi.mocked(previewStarterWordsAction).mockReturnValue(new Promise((resolve) => { resolveMeanings = resolve; }));
  vi.mocked(addStarterWordAction).mockResolvedValue({ ok: true });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  const cards = [card, { ...card, id: 'card-2' }, { ...card, id: 'card-3' }];
  const word = { lemma: 'der Bahnhof', example: 'Der Zug kommt an.', exampleTranslation: 'The train arrives.' };
  render(<FlashcardSession initialCards={cards} discover={[word]} extra={false} onFinish={vi.fn()}
    onReload={vi.fn()} onKeepPractising={vi.fn()} onSkip={vi.fn()} />);
  await waitFor(() => expect(previewStarterWordsAction).toHaveBeenCalledWith(['der Bahnhof']));
  for (let index = 0; index < 3; index++) {
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
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
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
});

const props = { discover: [], extra: false, onFinish: vi.fn(), onReload: vi.fn(), onKeepPractising: vi.fn(), onSkip: vi.fn() };

test('a one-card learning step stays at zero until a Good grade graduates it', async () => {
  vi.mocked(gradeCardAction)
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 1, learning_steps: 0, reps: 1 } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 2, learning_steps: 0, reps: 2 } });
  render(<FlashcardSession initialCards={[card]} {...props} />);
  const progress = screen.getByRole('progressbar');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /1 Again/ }));
  await waitFor(() => expect(gradeCardAction).toHaveBeenCalledTimes(1));
  expect(screen.getByText('0 of 1 cards · 1 left')).toBeInTheDocument();
  expect(screen.getByText(/Learning cards return until they graduate/)).toBeInTheDocument();
  expect(progress).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
  expect(screen.getByText('1 of 1 cards · 0 left')).toBeInTheDocument();
  expect(progress).toHaveAttribute('aria-valuenow', '1');
  expect(gradeCardAction).toHaveBeenLastCalledWith('card-1', 3, expect.objectContaining({ expectedReps: 1 }));
});

test('duplicate card IDs are reviewed once and undo restores one copy', async () => {
  vi.mocked(gradeCardAction)
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 1, reps: 1 } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 2, reps: 2 } });
  vi.mocked(undoReviewAction).mockResolvedValue({ status: 'ok', schedule: card.schedule });
  render(<FlashcardSession initialCards={[card, { ...card }]} {...props} />);
  const progress = screen.getByRole('progressbar');
  expect(screen.getByText('0 of 1 cards · 1 left')).toBeInTheDocument();
  expect(progress).toHaveAttribute('aria-valuemax', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /1 Again/ }));
  await waitFor(() => expect(gradeCardAction).toHaveBeenCalledTimes(1));
  expect(screen.getByText('0 of 1 cards · 1 left')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo last rating' }));
  await waitFor(() => expect(undoReviewAction).toHaveBeenCalledTimes(1));
  expect(screen.getByText('0 of 1 cards · 1 left')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
  expect(progress).toHaveAttribute('aria-valuenow', '1');
  expect(gradeCardAction).toHaveBeenCalledTimes(2);
});

test('progress total stays with the mounted queue if props change', () => {
  const second = { ...card, id: 'card-2', lemma: 'Baum' };
  const { rerender } = render(<FlashcardSession initialCards={[card, second]} {...props} />);
  rerender(<FlashcardSession initialCards={[card]} {...props} />);
  expect(screen.getByText('0 of 2 cards · 2 left')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
});

test('learning cards return after other cards and count as finished only when learned', async () => {
  const second = { ...card, id: 'card-2', lemma: 'Baum', translation: 'tree', exampleSentence: null, exampleTranslation: null };
  vi.mocked(gradeCardAction)
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 1, reps: 1, due: '2026-11-06T00:01:00.000Z' } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...second.schedule, state: 2, reps: 1 } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 2, reps: 2 } });
  const onFinish = vi.fn();
  render(<FlashcardSession initialCards={[card, second]} {...props} onFinish={onFinish} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /1 Again/ }));
  await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  fireEvent.click(screen.getByRole('button', { name: 'End review' }));
  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ reviewed: 1, scheduledLater: 1, nextReviewAt: '2026-11-06T00:01:00.000Z' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  await waitFor(() => expect(screen.getByText('All due words done.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Back to my words' }));
  expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({ reviewed: 2, scheduledLater: 0, nextReviewAt: null }));
  expect(gradeCardAction).toHaveBeenLastCalledWith('card-1', 3, expect.objectContaining({ expectedReps: 1 }));
});

test('undo restores a reviewed card using its previous due date and saved reps', async () => {
  const reviewedCard: SessionCard = { ...card, schedule: { ...card.schedule, state: 2, reps: 1,
    due: '2026-11-01T00:00:00.000Z', last_review: '2026-10-20T00:00:00.000Z' } };
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...reviewedCard.schedule, reps: 2 } });
  vi.mocked(undoReviewAction).mockResolvedValue({ status: 'ok', schedule: reviewedCard.schedule });
  render(<FlashcardSession initialCards={[reviewedCard]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  await waitFor(() => expect(screen.getByText('All due words done.')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Undo last rating' }));
  await waitFor(() => expect(undoReviewAction).toHaveBeenCalledWith('card-1', 2, reviewedCard.schedule.due));
  expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByRole('button', { name: 'Undo last rating' })).not.toBeInTheDocument();
});

test('undo removes the re-queued learning copy', async () => {
  const second = { ...card, id: 'card-2', lemma: 'Baum', exampleSentence: null, exampleTranslation: null };
  vi.mocked(gradeCardAction)
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 1, reps: 1 } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } })
    .mockResolvedValueOnce({ status: 'ok', next: { ...second.schedule, state: 2, reps: 1 } });
  vi.mocked(undoReviewAction).mockResolvedValue({ status: 'ok', schedule: card.schedule });
  render(<FlashcardSession initialCards={[card, second]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /1 Again/ }));
  await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Undo last rating' }));
  await waitFor(() => expect(screen.getByText('Haus')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
  expect(screen.getByText('0 of 2 cards · 2 left')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  await waitFor(() => expect(screen.getByText('Baum')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
});

test('stale undo reports the error and removes the option', async () => {
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  vi.mocked(undoReviewAction).mockResolvedValue({ status: 'stale' });
  render(<FlashcardSession initialCards={[card]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Undo last rating' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not undo. The card changed or the review was already saved.');
  expect(screen.queryByRole('button', { name: 'Undo last rating' })).not.toBeInTheDocument();
});

test('discovery is optional and does not change review progress', async () => {
  const word = { lemma: 'der Bahnhof', example: 'Der Zug kommt an.', exampleTranslation: 'The train arrives.' };
  vi.mocked(previewStarterWordsAction).mockResolvedValue({ 'der Bahnhof': 'station' });
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  render(<FlashcardSession initialCards={[card]} {...props} discover={[word]} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1');
  expect(screen.getByText('0 of 1 cards · 1 left')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Good/ }));
  expect(await screen.findByText("Optional new word. It doesn't count towards your review.")).toBeInTheDocument();
  expect(screen.getByText('1 of 1 cards · 0 left')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  expect(await screen.findByText('All due words done.')).toBeInTheDocument();
});

test('rating shortcuts work from the hint checkbox and buttons show their keys', async () => {
  vi.mocked(gradeCardAction).mockResolvedValue({ status: 'ok', next: { ...card.schedule, state: 2, reps: 1 } });
  render(<FlashcardSession initialCards={[card]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  for (const [key, label] of [['1', 'Again'], ['2', 'Hard'], ['3', 'Good'], ['4', 'Easy']]) {
    expect(screen.getByRole('button', { name: new RegExp(`${key} ${label}`) })).toBeInTheDocument();
  }
  const checkbox = screen.getByRole('checkbox', { name: 'Show sentence hint' });
  checkbox.focus();
  fireEvent.keyDown(checkbox, { key: '3' });
  await waitFor(() => expect(gradeCardAction).toHaveBeenCalledWith('card-1', 3, expect.anything()));
});

test('day-level interval labels have an approximate prefix', () => {
  const now = new Date();
  const reviewCard = { ...card, schedule: { ...card.schedule, state: 2 as const, reps: 1, stability: 10, difficulty: 5,
    due: new Date(now.getTime() - 86_400_000).toISOString(), last_review: new Date(now.getTime() - 10 * 86_400_000).toISOString() } };
  render(<FlashcardSession initialCards={[reviewCard]} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  expect(screen.getByRole('button', { name: /3 Good/ })).toHaveTextContent(/~\d+(?:d|mo|y)/);
});
