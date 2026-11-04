import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NotesBrowser } from '@/app/notes/notes-browser';
import {
  deleteGrammarNoteAction, listNoteCategoriesAction, saveGrammarNoteAction, searchSavedWordsAction,
  updateGrammarNoteAction, updateVocabNoteAction,
} from '@/app/vocab/actions';
import type { GrammarNote, VocabEntry } from '@/lib/types/db';

const refresh = vi.fn();
const confirm = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => confirm }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  deleteGrammarNoteAction: vi.fn(), listNoteCategoriesAction: vi.fn().mockResolvedValue([]),
  saveGrammarNoteAction: vi.fn(), searchSavedWordsAction: vi.fn(),
  updateGrammarNoteAction: vi.fn(), updateVocabNoteAction: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const grammarNote: GrammarNote = {
  id: 'grammar-1', user_id: 'user-1', note: 'Use habe with ich.',
  category: null, example_sentence: 'Ich habe Zeit.', created_at: '2026-01-02T00:00:00.000Z',
};
const wordNote: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Hund', lemma: 'Hund', translation: 'dog',
  example_sentence: null, note: 'Remember the article.', source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

function browser(grammarNotes: GrammarNote[] = [], wordNotes: VocabEntry[] = []) {
  return <NotesBrowser grammarNotes={grammarNotes} wordNotes={wordNotes} heading={<h1>Your notes.</h1>} />;
}

test('adds a standalone note and shows it after refreshed data arrives', async () => {
  vi.mocked(saveGrammarNoteAction).mockResolvedValue({ ok: true });
  const view = render(browser());
  expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
  expect(screen.queryByRole('combobox', { name: 'Category (optional)' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Use habe with ich.' } });
  fireEvent.click(screen.getByRole('button', { name: '+ category' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Category (optional)' }), { target: { value: 'Verbs' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(saveGrammarNoteAction).toHaveBeenCalledWith('Use habe with ich.', undefined, 'Verbs'));
  expect(refresh).toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Add a note' })).toHaveValue('');
  view.rerender(browser([{ ...grammarNote, category: 'Verbs' }]));
  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  expect(within(screen.getByRole('article')).getByText('Verbs')).toBeInTheDocument();
});

test('attaches a note to a searched saved word', async () => {
  vi.mocked(searchSavedWordsAction).mockResolvedValue([{ id: 'word-1', lemma: 'Hund' }]);
  vi.mocked(updateVocabNoteAction).mockResolvedValue({ ok: true });
  render(browser());
  fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Remember the article.' } });
  fireEvent.click(screen.getByRole('button', { name: 'attach to a saved word (optional)' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved words' }), { target: { value: 'Hun' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Hund' }));
  expect(screen.getByRole('button', { name: 'Remove attachment: Hund' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Category (optional)' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ category' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(updateVocabNoteAction).toHaveBeenCalledWith('word-1', 'Remember the article.'));
  expect(saveGrammarNoteAction).not.toHaveBeenCalled();
});

test('word notes show their lemma badge and notes are ordered newest first', () => {
  render(browser([grammarNote], [wordNote]));
  const rows = screen.getAllByRole('article');
  expect(within(rows[0]).getByText('Use habe with ich.')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Hund')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Remember the article.')).toBeInTheDocument();
});

test('suggested categories appear in a datalist while free typing remains available', async () => {
  vi.mocked(listNoteCategoriesAction).mockResolvedValue(['Ideas', 'Verbs']);
  render(browser());
  fireEvent.click(screen.getByRole('button', { name: '+ category' }));
  const input = screen.getByRole('combobox', { name: 'Category (optional)' });
  expect(input).toHaveAttribute('list', 'new-note-category-options');
  await waitFor(() => expect(document.querySelectorAll('#new-note-category-options option')).toHaveLength(2));
  expect([...document.querySelectorAll('#new-note-category-options option')].map((option) => option.getAttribute('value')))
    .toEqual(['Ideas', 'Verbs']);
  fireEvent.change(input, { target: { value: 'My own category' } });
  expect(input).toHaveValue('My own category');
  expect(listNoteCategoriesAction).toHaveBeenCalledTimes(1);
});

test('category and saved-word toggles are independent and closing category clears its draft', () => {
  render(browser());
  const categoryToggle = screen.getByRole('button', { name: '+ category' });
  const attachToggle = screen.getByRole('button', { name: 'attach to a saved word (optional)' });
  fireEvent.click(categoryToggle);
  fireEvent.change(screen.getByRole('combobox', { name: 'Category (optional)' }), { target: { value: 'Ideas' } });
  fireEvent.click(attachToggle);
  expect(screen.getByRole('combobox', { name: 'Category (optional)' })).toHaveValue('Ideas');
  expect(screen.getByRole('searchbox', { name: 'Search saved words' })).toBeInTheDocument();
  fireEvent.click(categoryToggle);
  expect(screen.queryByRole('combobox', { name: 'Category (optional)' })).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Search saved words' })).toBeInTheDocument();
  fireEvent.click(categoryToggle);
  expect(screen.getByRole('combobox', { name: 'Category (optional)' })).toHaveValue('');
});

test('category filter shows matching grammar notes and hides word notes', async () => {
  vi.mocked(listNoteCategoriesAction).mockResolvedValue(['Ideas', 'Verbs']);
  render(browser([
    { ...grammarNote, category: 'Verbs' },
    { ...grammarNote, id: 'grammar-2', note: 'A different idea.', category: 'Ideas' },
  ], [wordNote]));
  fireEvent.click(await screen.findByRole('button', { name: 'Category All categories' }));
  fireEvent.click(screen.getByRole('option', { name: 'Verbs' }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  expect(screen.queryByText('A different idea.')).not.toBeInTheDocument();
  expect(screen.queryByText('Remember the article.')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 note in Verbs');
});

test('editing a grammar category sends the new value and updates its badge', async () => {
  vi.mocked(updateGrammarNoteAction).mockResolvedValue({ ok: true });
  render(browser([{ ...grammarNote, category: 'Verbs' }]));
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  fireEvent.change(within(screen.getByRole('article')).getByRole('combobox', { name: 'Category (optional)' }), { target: { value: 'Ideas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateGrammarNoteAction).toHaveBeenCalledWith('grammar-1', grammarNote.note, 'Ideas'));
  expect(within(screen.getByRole('article')).getByText('Ideas')).toBeInTheDocument();
});

test.each([
  ['grammar', [grammarNote], [] as VocabEntry[], updateGrammarNoteAction, 'grammar-1'],
  ['word', [] as GrammarNote[], [wordNote], updateVocabNoteAction, 'word-1'],
] as const)('edits a %s note inline', async (_kind, grammarNotes, wordNotes, action, id) => {
  vi.mocked(action).mockResolvedValue({ ok: true });
  render(browser([...grammarNotes], [...wordNotes]));
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit note' }), { target: { value: 'Updated note.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(action).toHaveBeenCalledWith(...(_kind === 'grammar'
    ? [id, 'Updated note.', ''] : [id, 'Updated note.'])));
  expect(screen.getByText('Updated note.')).toBeInTheDocument();
});

test.each([
  ['grammar', [grammarNote], [] as VocabEntry[], deleteGrammarNoteAction, 'grammar-1', undefined],
  ['word', [] as GrammarNote[], [wordNote], updateVocabNoteAction, 'word-1', ''],
] as const)('confirms and removes a %s note', async (_kind, grammarNotes, wordNotes, action, id, clear) => {
  confirm.mockResolvedValue(true);
  vi.mocked(action).mockResolvedValue({ ok: true });
  render(browser([...grammarNotes], [...wordNotes]));
  fireEvent.click(screen.getByRole('button', { name: 'Remove note' }));
  await waitFor(() => expect(action).toHaveBeenCalledWith(...(clear === undefined ? [id] : [id, clear])));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove this note?' }));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
