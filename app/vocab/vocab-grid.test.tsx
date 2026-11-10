import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { VocabGrid } from '@/app/vocab/vocab-grid';
import type { VocabEntry } from '@/lib/types/db';

vi.mock('@/app/vocab/remove-word-button', () => ({ RemoveWordButton: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({ updateVocabAction: vi.fn() }));
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
function mockDialogs() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
}
beforeEach(mockDialogs);
afterEach(() => {
  cleanup();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, example_translation: null, note: 'Always das Haus.', source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
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

test('mobile Filters opens a dialog with live search, Show, and Sort controls that Apply closes', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  const trigger = screen.getByRole('button', { name: 'Filters' });
  expect(trigger).not.toHaveAttribute('aria-expanded');
  expect(trigger).not.toHaveAttribute('aria-controls');
  fireEvent.click(trigger);

  const dialog = screen.getByRole('dialog', { name: 'Filters' });
  expect(within(dialog).getByRole('searchbox', { name: 'Search your words' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Show All words' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Sort Newest first' })).toBeInTheDocument();

  fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Search your words' }), { target: { value: 'missing' } });
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 words shown');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Show All words' }));
  fireEvent.click(within(dialog).getByRole('option', { name: 'Ready to review' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sort Newest first' }));
  fireEvent.click(within(dialog).getByRole('option', { name: 'A–Z' }));
  expect(screen.getByRole('button', { name: 'Filters (3)' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filters (3)' }));
  const reopenedDialog = screen.getByRole('dialog', { name: 'Filters' });
  expect(within(reopenedDialog).getByRole('searchbox', { name: 'Search your words' })).toHaveValue('missing');
  expect(within(reopenedDialog).getByRole('button', { name: 'Show Ready to review' })).toBeInTheDocument();
  expect(within(reopenedDialog).getByRole('button', { name: 'Sort A–Z' })).toBeInTheDocument();
});

test('desktop filter bar keeps its inline controls', () => {
  const { container } = render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  const inlineBar = container.querySelector('.sm\\:grid');
  expect(inlineBar).toHaveClass('hidden', 'sm:grid', 'sm:grid-cols-[1fr_auto_auto]');
  expect(inlineBar).not.toHaveAttribute('id');
  expect(within(inlineBar as HTMLElement).getByRole('searchbox', { name: 'Search your words' })).toBeInTheDocument();
  expect(within(inlineBar as HTMLElement).getByRole('button', { name: 'Show All words' })).toBeInTheDocument();
  expect(within(inlineBar as HTMLElement).getByRole('button', { name: 'Sort Newest first' })).toBeInTheDocument();
});

test('the icon edit control opens the editor for a missing meaning', () => {
  render(<VocabGrid entries={[{ ...entry, translation: null }]} dueWordIds={[]} />);
  const edit = screen.getByRole('button', { name: 'Edit Haus' });
  expect(edit).toHaveAttribute('title', 'Edit');
  expect(edit).toHaveTextContent('');
  expect(edit.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(edit);
  expect(screen.getByRole('dialog', { name: 'Edit word' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Haus' })).toBeInTheDocument();
});

test('edit control opens the editor for an existing meaning', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Haus' }));
  expect(screen.getByRole('dialog', { name: 'Edit word' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Meaning' })).toHaveValue('house');
});

test('cards show only review and missing-meaning statuses', () => {
  render(<VocabGrid entries={[entry, { ...entry, id: 'word-2', lemma: 'neu', translation: null }, { ...entry, id: 'word-3', lemma: 'alt' }]}
    dueWordIds={['word-1']} />);
  expect(screen.getByText('Ready to review')).toBeInTheDocument();
  expect(screen.queryByText('Saved for later')).not.toBeInTheDocument();
  expect(screen.getByText('Missing meaning · excluded from review')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Suspend|Resume|Add meaning/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  expect(screen.queryByRole('option', { name: 'Suspended' })).not.toBeInTheDocument();
});

test('clear search and filters also resets sorting', () => {
  render(<VocabGrid entries={[entry]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sort Newest first' }));
  fireEvent.click(screen.getByRole('option', { name: 'A–Z' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search your words' }), { target: { value: 'absent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByRole('button', { name: 'Sort Newest first' })).toBeInTheDocument();
});
