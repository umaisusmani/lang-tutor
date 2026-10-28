import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { VocabBrowser } from '@/app/vocab/vocab-browser';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  discoverWordsAction: vi.fn(() => new Promise<never>(() => {})),
  startSessionAction: vi.fn(),
}));
vi.mock('@/app/vocab/vocab-grid', () => ({ VocabGrid: () => null }));

test('discovering words only changes the Discover words loading label', () => {
  const entry: VocabEntry = {
    id: 'word-1',
    user_id: 'user-1',
    term: 'Haus',
    lemma: 'Haus',
    translation: 'house',
    example_sentence: null,
    source: 'new_word',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  render(<VocabBrowser entries={[entry]} dueCount={1} dueWordIds={[entry.id]} heading={<h1>Vocabulary</h1>} />);

  const reviewButton = screen.getByRole('button', { name: 'Review due words' });
  const discoverButton = screen.getByRole('button', { name: 'Discover words' });
  fireEvent.click(discoverButton);

  expect(discoverButton).toHaveTextContent('Loading…');
  expect(reviewButton).toHaveTextContent('Review due words');
});
