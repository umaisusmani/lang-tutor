import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DiscoverWords } from '@/app/vocab/discover-words';
import { addStarterWordAction, previewStarterWordsAction } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({
  previewStarterWordsAction: vi.fn(),
  addStarterWordAction: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const word = { lemma: 'der Bahnhof', example: 'Der Zug kommt an.', exampleTranslation: 'The train arrives.' };

test('Discover shows the meaning and example without a reveal click', async () => {
  vi.mocked(previewStarterWordsAction).mockResolvedValue({ 'der Bahnhof': 'station' });
  vi.mocked(addStarterWordAction).mockResolvedValue({ ok: true });
  const onFinish = vi.fn();
  render(<DiscoverWords words={[word]} onSkip={vi.fn()} onFinish={onFinish} />);
  expect(screen.getByText('Loading meaning…')).toBeInTheDocument();
  expect(await screen.findByText('station')).toBeInTheDocument();
  expect(screen.getByText('Der Zug kommt an.')).toBeInTheDocument();
  expect(screen.getByText('The train arrives.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Show meaning/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add to my words' }));
  await waitFor(() => expect(onFinish).toHaveBeenCalledWith(1));
});

test('a failed batch can be retried while Skip word stays available', async () => {
  vi.mocked(previewStarterWordsAction).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ 'der Bahnhof': 'station' });
  render(<DiscoverWords words={[word]} onSkip={vi.fn()} onFinish={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the meaning.');
  expect(screen.getByRole('button', { name: 'Skip word' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Add to my words' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'try again' }));
  expect(await screen.findByText('station')).toBeInTheDocument();
  expect(previewStarterWordsAction).toHaveBeenCalledTimes(2);
});

test('one batch supplies meanings for every card in the Discover round', async () => {
  const second = { lemma: 'das Bad', example: 'Das Bad ist groß.', exampleTranslation: 'The bathroom is large.' };
  vi.mocked(previewStarterWordsAction).mockResolvedValue({ 'der Bahnhof': 'station', 'das Bad': 'bathroom' });
  render(<DiscoverWords words={[word, second]} onSkip={vi.fn()} onFinish={vi.fn()} />);
  expect(await screen.findByText('station')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Skip word' }));
  expect(screen.getByText('bathroom')).toBeInTheDocument();
  expect(previewStarterWordsAction).toHaveBeenCalledTimes(1);
  expect(previewStarterWordsAction).toHaveBeenCalledWith(['der Bahnhof', 'das Bad']);
});
