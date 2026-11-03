import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { VocabGrid } from '@/app/vocab/vocab-grid';
import { deleteGrammarNoteAction, updateGrammarNoteAction, updateVocabNoteAction } from '@/app/vocab/actions';
import type { GrammarNote, VocabEntry } from '@/lib/types/db';

vi.mock('@/app/vocab/remove-word-button', () => ({ RemoveWordButton: () => null }));
const confirm = vi.fn();
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => confirm }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  deleteGrammarNoteAction: vi.fn(), updateGrammarNoteAction: vi.fn(), updateVocabNoteAction: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, note: null, source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

test('filter selection and clear chip update the visible words', () => {
  render(<VocabGrid entries={[entry]} grammarNotes={[]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  fireEvent.click(screen.getByRole('option', { name: 'Ready to review' }));
  expect(screen.getByRole('status')).toHaveTextContent('0 of 1 words shown');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
  expect(screen.getByRole('status')).toHaveTextContent('1 of 1 words shown');
});

const grammarNote: GrammarNote = {
  id: 'note-1', user_id: 'user-1', note: 'Use habe with ich.',
  example_sentence: 'Ich habe Zeit.', created_at: '2026-01-02T00:00:00.000Z',
};

function showNotes() {
  fireEvent.click(screen.getByRole('button', { name: 'Show All words' }));
  fireEvent.click(screen.getByRole('option', { name: 'My notes' }));
}

test('notes filter shows grammar cards and hides word search', () => {
  render(<VocabGrid entries={[entry]} grammarNotes={[grammarNote]} dueWordIds={[]} />);
  showNotes();
  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  expect(screen.getByText('Ich habe Zeit.')).toBeInTheDocument();
  expect(screen.queryByText('Haus')).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 saved notes');
});

test('edits and saves a grammar note', async () => {
  vi.mocked(updateGrammarNoteAction).mockResolvedValue({ ok: true });
  render(<VocabGrid entries={[entry]} grammarNotes={[grammarNote]} dueWordIds={[]} />);
  showNotes();
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit grammar note' }), { target: { value: 'Use bin with ich.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateGrammarNoteAction).toHaveBeenCalledWith('note-1', 'Use bin with ich.'));
  expect(screen.getByText('Use bin with ich.')).toBeInTheDocument();
});

test('confirms before deleting a grammar note', async () => {
  confirm.mockResolvedValue(true);
  vi.mocked(deleteGrammarNoteAction).mockResolvedValue({ ok: true });
  render(<VocabGrid entries={[entry]} grammarNotes={[grammarNote]} dueWordIds={[]} />);
  showNotes();
  fireEvent.click(screen.getByRole('button', { name: 'Remove note' }));
  await waitFor(() => expect(deleteGrammarNoteAction).toHaveBeenCalledWith('note-1'));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove this note?' }));
  await waitFor(() => expect(screen.queryByText('Use habe with ich.')).not.toBeInTheDocument());
});

test('adds a personal note to a revealed word', async () => {
  vi.mocked(updateVocabNoteAction).mockResolvedValue({ ok: true });
  render(<VocabGrid entries={[entry]} grammarNotes={[]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /Haus.*tap to reveal/ }));
  fireEvent.click(screen.getByRole('button', { name: 'add a note…' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Personal word note' }), { target: { value: 'Remember the article.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateVocabNoteAction).toHaveBeenCalledWith('word-1', 'Remember the article.'));
  expect(screen.getByText('Remember the article.')).toBeInTheDocument();
});

test('shows an existing personal note on a revealed word', () => {
  render(<VocabGrid entries={[{ ...entry, note: 'Always das Haus.' }]} grammarNotes={[]} dueWordIds={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /Haus.*tap to reveal/ }));
  expect(screen.getByText('Always das Haus.')).toBeInTheDocument();
});
