import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NoteRow } from '@/app/notes/note-row';
import { updateGrammarNoteAction } from '@/app/vocab/actions';
import type { GrammarNote, NoteCategory, VocabEntry } from '@/lib/types/db';

vi.mock('@/app/notes/rich-editor', () => import('@/app/notes/rich-editor.mock'));
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  createNoteCategoryAction: vi.fn(), deleteGrammarNoteAction: vi.fn(), updateGrammarNoteAction: vi.fn(), updateVocabNoteAction: vi.fn(),
}));
afterEach(cleanup);

const category: NoteCategory = { id: 'verbs', user_id: 'user-1', name: 'Verbs', created_at: '2026-01-01' };
const grammarNote: GrammarNote = {
  id: 'grammar-1', user_id: 'user-1', note: '<strong>Bold</strong> and <em>italic</em> <u>underlined</u>',
  category_id: 'verbs', example_sentence: null, created_at: '2026-01-02',
};

test('grammar notes safely render marks and category names', () => {
  render(<NoteRow item={{ kind: 'grammar', note: grammarNote }} categories={[category]}
    onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  expect(within(row).getByText('Verbs')).toBeInTheDocument();
  expect(row.querySelector('strong')).toHaveTextContent('Bold');
  expect(row.querySelector('em')).toHaveTextContent('italic');
  expect(row.querySelector('u')).toHaveTextContent('underlined');
  const actions = within(row).getAllByRole('button', { name: /(?:Edit|Remove) note/ });
  expect(actions.map((button) => button.getAttribute('title'))).toEqual(['Edit note', 'Remove note']);
  expect(actions[0].closest('div')?.parentElement).toBe(row.firstElementChild);
  expect(within(row).queryByText('edit')).not.toBeInTheDocument();
  expect(within(row).queryByText('remove')).not.toBeInTheDocument();
});

test('read-only rendering discards attributes and unsafe wrappers while keeping text', () => {
  render(<NoteRow item={{ kind: 'grammar', note: { ...grammarNote, note: '<span onclick="evil()">safe</span>' } }} categories={[]}
    onRemoved={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText('safe')).toBeInTheDocument();
  expect(screen.getByRole('article').querySelector('span[onclick]')).toBeNull();
});

test('word notes remain literal plain text', () => {
  const note: VocabEntry = {
    id: 'word-1', user_id: 'user-1', term: 'Hund', lemma: 'Hund', translation: 'dog',
    example_sentence: null, example_translation: null, note: '**literal**', source: 'new_word', created_at: '2026-01-01',
  };
  render(<NoteRow item={{ kind: 'word', note }} categories={[category]}
    onRemoved={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText('**literal**')).toBeInTheDocument();
  expect(screen.queryByText('Verbs')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  expect(screen.getByRole('textbox', { name: 'Edit note' }).tagName).toBe('TEXTAREA');
});

test('the category dropdown can clear an assigned category', async () => {
  vi.mocked(updateGrammarNoteAction).mockResolvedValue({ ok: true });
  render(<NoteRow item={{ kind: 'grammar', note: grammarNote }} categories={[category]}
    onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit note' }));
  const select = within(row).getByRole('button', { name: 'Category Verbs' });
  fireEvent.click(select);
  fireEvent.click(within(row).getByRole('option', { name: 'No category' }));
  expect(select).toHaveTextContent('No category');
  fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateGrammarNoteAction).toHaveBeenCalledWith('grammar-1', grammarNote.note, null));
});

test('stored tables, headings, lists and links render as real elements with safe links', () => {
  const note = '<h2>Haben</h2><ul><li>ich habe</li></ul><table><thead><tr><th>Case</th></tr></thead><tbody><tr><td>Nom</td></tr></tbody></table>'
    + '<p><a href="https://example.com" onclick="x()">more</a> <a href="javascript:alert(1)">bad</a></p>';
  render(<NoteRow item={{ kind: 'grammar', note: { ...grammarNote, note } }} categories={[]} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  expect(within(row).getByRole('heading', { name: 'Haben' })).toBeInTheDocument();
  expect(within(row).getByRole('list')).toBeInTheDocument();
  expect(within(row).getByRole('columnheader', { name: 'Case' })).toBeInTheDocument();
  expect(within(row).getByRole('cell', { name: 'Nom' })).toBeInTheDocument();
  expect(row.querySelector('.note-table-wrap table')).not.toBeNull();
  const link = within(row).getByRole('link', { name: 'more' });
  expect(link).toHaveAttribute('href', 'https://example.com');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).not.toHaveAttribute('onclick');
  expect(within(row).queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
  expect(row).toHaveTextContent('bad');
});

test('a legacy note with plain newlines still shows both lines', () => {
  render(<NoteRow item={{ kind: 'grammar', note: { ...grammarNote, note: 'line1\nline2' } }} categories={[]} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  expect(row.querySelector('br')).not.toBeNull();
  expect(row).toHaveTextContent('line1line2');
});

test('Save is disabled while the edited note is over the length limit', () => {
  render(<NoteRow item={{ kind: 'grammar', note: grammarNote }} categories={[]} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  fireEvent.click(within(row).getByRole('button', { name: 'Edit note' }));
  const editor = within(row).getByRole('textbox', { name: 'Edit note' });
  editor.innerHTML = `<p>${'x'.repeat(5001)}</p>`;
  fireEvent.input(editor);
  expect(within(row).getByRole('button', { name: 'Save' })).toBeDisabled();
  editor.innerHTML = '<p>fine</p>';
  fireEvent.input(editor);
  expect(within(row).getByRole('button', { name: 'Save' })).toBeEnabled();
});
