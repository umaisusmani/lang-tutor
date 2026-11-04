import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { VocabGrid } from '@/app/vocab/vocab-grid';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('@/app/vocab/remove-word-button', () => ({ RemoveWordButton: () => null }));
afterEach(cleanup);

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, note: 'Always das Haus.', source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

test('filter selection and clear chip update the visible words', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  fireEvent.click(screen.getByRole('option', { name: 'Ready to review' }));
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 words shown');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByRole('status')).toHaveTextContent('1 of 1 words shown');
});

test('revealed cards show meanings without personal notes', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /Haus.*tap to reveal/ }));
  expect(screen.getByText('house')).toBeInTheDocument();
  expect(screen.queryByText('Always das Haus.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'add a note…' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  expect(screen.queryByRole('option', { name: 'My notes' })).not.toBeInTheDocument();
});

test('mobile Filters toggle controls the search panel and marks active criteria', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  const toggle = screen.getByRole('button', { name: 'Filters' });
  const controls = document.getElementById('vocab-filter-controls');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(controls).toHaveClass('hidden', 'sm:grid');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(controls).toHaveClass('grid');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search your words' }), { target: { value: 'missing' } });
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Filters (1)' })).toHaveAttribute('aria-expanded', 'false');
  expect(controls).toHaveClass('hidden');
});
