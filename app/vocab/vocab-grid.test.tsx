import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { VocabGrid } from '@/app/vocab/vocab-grid';
import { setWordSuspendedAction } from '@/app/vocab/actions';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('@/app/vocab/remove-word-button', () => ({ RemoveWordButton: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({ setWordSuspendedAction: vi.fn(), updateVocabAction: vi.fn() }));
afterEach(cleanup);

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
function mockDialogs() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
}

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, example_translation: null, note: 'Always das Haus.', source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

test('filter selection and clear chip update the visible words', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  fireEvent.click(screen.getByRole('option', { name: 'In your next session' }));
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 words shown');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByRole('status')).toHaveTextContent('1 of 1 words shown');
});

test('revealed cards show meanings without personal notes', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{}} />);
  fireEvent.click(screen.getByRole('button', { name: /Haus.*tap to reveal/ }));
  expect(screen.getByText('house')).toBeInTheDocument();
  expect(screen.queryByText('Always das Haus.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'add a note…' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  expect(screen.queryByRole('option', { name: 'My notes' })).not.toBeInTheDocument();
});

test('mobile Filters toggle controls the search panel and marks active criteria', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{}} />);
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

test('Add meaning opens the word editor', () => {
  mockDialogs();
  render(<VocabGrid entries={[{ ...entry, translation: null }]} dueWordIds={[]} schedules={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add meaning' }));
  expect(screen.getByRole('dialog', { name: 'Edit word' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Haus' })).toBeInTheDocument();
  cleanup();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('edit control opens the editor for an existing meaning', () => {
  mockDialogs();
  render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Haus' }));
  expect(screen.getByRole('dialog', { name: 'Edit word' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Meaning' })).toHaveValue('house');
  cleanup();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('suspend and resume use the requested state', async () => {
  vi.mocked(setWordSuspendedAction).mockResolvedValue({ ok: true });
  const schedule = { suspended: false, state: 2 as const, nextDue: '2026-11-07T00:00:00.000Z' };
  const view = render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{ [entry.id]: schedule }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Suspend Haus' }));
  await waitFor(() => expect(setWordSuspendedAction).toHaveBeenCalledWith('word-1', true));
  view.rerender(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{ [entry.id]: { ...schedule, suspended: true } }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resume Haus' }));
  await waitFor(() => expect(setWordSuspendedAction).toHaveBeenCalledWith('word-1', false));
});

test('schedule labels distinguish suspended, new, and due soon', () => {
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  render(<VocabGrid entries={[entry, { ...entry, id: 'word-2', lemma: 'neu' }, { ...entry, id: 'word-3', lemma: 'alt' }]}
    dueWordIds={[]} schedules={{
      'word-1': { suspended: true, state: 2, nextDue: null },
      'word-2': { suspended: false, state: 0, nextDue: null },
      'word-3': { suspended: false, state: 2, nextDue: due },
    }} />);
  expect(screen.getByText('Suspended')).toBeInTheDocument();
  expect(screen.getByText('New (not started)')).toBeInTheDocument();
  expect(screen.getByText(/Due in [34] days/)).toBeInTheDocument();
});

test('clear search and filters also resets sorting', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} schedules={{}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sort Newest first' }));
  fireEvent.click(screen.getByRole('option', { name: 'A–Z' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search your words' }), { target: { value: 'absent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByRole('button', { name: 'Sort Newest first' })).toBeInTheDocument();
});
