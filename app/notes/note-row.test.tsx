import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NoteRow } from '@/app/notes/note-row';
import type { GrammarNote, NoteCategory, VocabEntry } from '@/lib/types/db';

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
    onRemoved={vi.fn()} onChanged={vi.fn()} onCategoryCreated={vi.fn()} />);
  const row = screen.getByRole('article');
  expect(within(row).getByText('Verbs')).toBeInTheDocument();
  expect(row.querySelector('strong')).toHaveTextContent('Bold');
  expect(row.querySelector('em')).toHaveTextContent('italic');
  expect(row.querySelector('u')).toHaveTextContent('underlined');
});

test('read-only rendering discards attributes and unsafe wrappers while keeping text', () => {
  render(<NoteRow item={{ kind: 'grammar', note: { ...grammarNote, note: '<span onclick="evil()">safe</span>' } }} categories={[]}
    onRemoved={vi.fn()} onChanged={vi.fn()} onCategoryCreated={vi.fn()} />);
  expect(screen.getByText('safe')).toBeInTheDocument();
  expect(screen.getByRole('article').querySelector('span[onclick]')).toBeNull();
});

test('word notes remain literal plain text', () => {
  const note: VocabEntry = {
    id: 'word-1', user_id: 'user-1', term: 'Hund', lemma: 'Hund', translation: 'dog',
    example_sentence: null, note: '**literal**', source: 'new_word', created_at: '2026-01-01',
  };
  render(<NoteRow item={{ kind: 'word', note }} categories={[category]}
    onRemoved={vi.fn()} onChanged={vi.fn()} onCategoryCreated={vi.fn()} />);
  expect(screen.getByText('**literal**')).toBeInTheDocument();
  expect(screen.queryByText('Verbs')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  expect(screen.getByRole('textbox', { name: 'Edit note' }).tagName).toBe('TEXTAREA');
});
