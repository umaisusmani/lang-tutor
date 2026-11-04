import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NotesBrowser } from '@/app/notes/notes-browser';
import {
  createNoteCategoryAction, deleteGrammarNoteAction, listNoteCategoriesAction, saveGrammarNoteAction,
  searchSavedWordsAction, updateGrammarNoteAction, updateVocabNoteAction,
} from '@/app/vocab/actions';
import type { GrammarNote, NoteCategory, VocabEntry } from '@/lib/types/db';

const refresh = vi.fn();
const confirm = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => confirm }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  createNoteCategoryAction: vi.fn(), deleteGrammarNoteAction: vi.fn(), listNoteCategoriesAction: vi.fn().mockResolvedValue([]),
  saveGrammarNoteAction: vi.fn(), searchSavedWordsAction: vi.fn(),
  updateGrammarNoteAction: vi.fn(), updateVocabNoteAction: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(listNoteCategoriesAction).mockResolvedValue([]); });

const verbs: NoteCategory = { id: 'verbs', user_id: 'user-1', name: 'Verbs', created_at: '2026-01-01' };
const ideas: NoteCategory = { id: 'ideas', user_id: 'user-1', name: 'Ideas', created_at: '2026-01-01' };
const grammarNote: GrammarNote = {
  id: 'grammar-1', user_id: 'user-1', note: 'Use habe with ich.',
  category_id: null, example_sentence: 'Ich habe Zeit.', created_at: '2026-01-02T00:00:00.000Z',
};
const wordNote: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Hund', lemma: 'Hund', translation: 'dog',
  example_sentence: null, note: 'Remember the article.', source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};

function browser(grammarNotes: GrammarNote[] = [], wordNotes: VocabEntry[] = []) {
  return <NotesBrowser grammarNotes={grammarNotes} wordNotes={wordNotes} heading={<h1>Your notes.</h1>} />;
}

function enterHtml(label: string, html: string) {
  const editor = screen.getByRole('textbox', { name: label });
  editor.innerHTML = html;
  fireEvent.input(editor);
}

test('adds sanitized rich text with a selected managed category', async () => {
  vi.mocked(listNoteCategoriesAction).mockResolvedValue([verbs]);
  vi.mocked(saveGrammarNoteAction).mockResolvedValue({ ok: true });
  const view = render(browser());
  const addBox = screen.getByRole('heading', { name: 'Add a note' }).closest('section')!;
  expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
  enterHtml('Add a note', '<strong>Use</strong> habe with ich.');
  fireEvent.click(within(addBox).getByRole('button', { name: 'Add or choose a category' }));
  fireEvent.click(await within(addBox).findByRole('button', { name: 'Verbs' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(saveGrammarNoteAction).toHaveBeenCalledWith('<strong>Use</strong> habe with ich.', undefined, 'verbs'));
  expect(refresh).toHaveBeenCalled();
  view.rerender(browser([{ ...grammarNote, note: '<strong>Use</strong> habe with ich.', category_id: 'verbs' }]));
  expect(within(screen.getByRole('article')).getByText('Verbs')).toBeInTheDocument();
});

test('attaches a plain note to a searched saved word', async () => {
  vi.mocked(searchSavedWordsAction).mockResolvedValue([{ id: 'word-1', lemma: 'Hund' }]);
  vi.mocked(updateVocabNoteAction).mockResolvedValue({ ok: true });
  render(browser());
  fireEvent.click(screen.getByRole('button', { name: 'attach to a saved word (optional)' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved words' }), { target: { value: 'Hun' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Hund' }));
  expect(screen.getByRole('textbox', { name: 'Add a note' }).tagName).toBe('TEXTAREA');
  fireEvent.change(screen.getByRole('textbox', { name: 'Add a note' }), { target: { value: 'Remember the article.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(updateVocabNoteAction).toHaveBeenCalledWith('word-1', 'Remember the article.'));
  expect(saveGrammarNoteAction).not.toHaveBeenCalled();
});

test('filter chips show matching grammar notes and hide word notes', async () => {
  vi.mocked(listNoteCategoriesAction).mockResolvedValue([ideas, verbs]);
  render(browser([
    { ...grammarNote, category_id: 'verbs' },
    { ...grammarNote, id: 'grammar-2', note: 'A different idea.', category_id: 'ideas' },
  ], [wordNote]));
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(await screen.findByRole('button', { name: 'Verbs' }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  expect(screen.queryByText('A different idea.')).not.toBeInTheDocument();
  expect(screen.queryByText('Remember the article.')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 note in Verbs');
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(listNoteCategoriesAction).toHaveBeenCalledTimes(1);
});

test('a category created while editing is immediately available in the add box', async () => {
  vi.mocked(createNoteCategoryAction).mockResolvedValue({ ok: true, category: ideas });
  render(browser([grammarNote]));
  const row = screen.getByRole('article');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit note' }));
  fireEvent.click(within(row).getByRole('button', { name: 'Add or choose a category' }));
  fireEvent.change(within(row).getByRole('textbox', { name: 'New category name' }), { target: { value: 'Ideas' } });
  fireEvent.click(within(row).getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ideas' })).toBeInTheDocument());
  const addBox = screen.getByRole('heading', { name: 'Add a note' }).closest('section')!;
  fireEvent.click(within(addBox).getByRole('button', { name: 'Add or choose a category' }));
  expect(within(addBox).getByRole('button', { name: 'Ideas' })).toBeInTheDocument();
});

test('editing rich text saves HTML and category ID', async () => {
  vi.mocked(listNoteCategoriesAction).mockResolvedValue([verbs]);
  vi.mocked(updateGrammarNoteAction).mockResolvedValue({ ok: true });
  render(browser([grammarNote]));
  const row = screen.getByRole('article');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit note' }));
  enterHtml('Edit note', '<u>Updated note.</u>');
  fireEvent.click(within(row).getByRole('button', { name: 'Add or choose a category' }));
  fireEvent.click(await within(row).findByRole('button', { name: 'Verbs' }));
  fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateGrammarNoteAction).toHaveBeenCalledWith('grammar-1', '<u>Updated note.</u>', 'verbs'));
  expect(row.querySelector('u')).toHaveTextContent('Updated note.');
});

test('word notes retain their lemma badge and newest-first order', () => {
  render(browser([grammarNote], [wordNote]));
  const rows = screen.getAllByRole('article');
  expect(within(rows[0]).getByText('Use habe with ich.')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Hund')).toBeInTheDocument();
});

test('removing a grammar note still confirms before deleting', async () => {
  confirm.mockResolvedValue(true);
  vi.mocked(deleteGrammarNoteAction).mockResolvedValue({ ok: true });
  render(browser([grammarNote]));
  fireEvent.click(screen.getByRole('button', { name: 'Remove note' }));
  await waitFor(() => expect(deleteGrammarNoteAction).toHaveBeenCalledWith('grammar-1'));
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});
