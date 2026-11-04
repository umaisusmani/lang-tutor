import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NoteRow } from '@/app/notes/note-row';
import type { GrammarNote, VocabEntry } from '@/lib/types/db';

vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({
  deleteGrammarNoteAction: vi.fn(), updateGrammarNoteAction: vi.fn(), updateVocabNoteAction: vi.fn(),
}));
afterEach(cleanup);

test('grammar notes render inline formatting and show their category badge', () => {
  const note: GrammarNote = {
    id: 'grammar-1', user_id: 'user-1', note: '**Bold** and *italic*\nnext line',
    category: 'Verbs', example_sentence: null, created_at: '2026-01-02',
  };
  render(<NoteRow item={{ kind: 'grammar', note }} categories={[]} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  const row = screen.getByRole('article');
  expect(within(row).getByText('Verbs')).toBeInTheDocument();
  expect(row.querySelector('strong')).toHaveTextContent('Bold');
  expect(row.querySelector('em')).toHaveTextContent('italic');
  expect(row.querySelector('p')).toHaveClass('whitespace-pre-wrap');
});

test('word notes retain literal markers and have no category badge', () => {
  const note: VocabEntry = {
    id: 'word-1', user_id: 'user-1', term: 'Hund', lemma: 'Hund', translation: 'dog',
    example_sentence: null, note: '**literal**', source: 'new_word', created_at: '2026-01-01',
  };
  render(<NoteRow item={{ kind: 'word', note }} categories={['Verbs']} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText('**literal**')).toBeInTheDocument();
  expect(screen.getByText('Hund')).toBeInTheDocument();
  expect(screen.queryByText('Verbs')).not.toBeInTheDocument();
});

test('uncategorized grammar note reveals category input only when requested and clears it on close', () => {
  const note: GrammarNote = {
    id: 'grammar-2', user_id: 'user-1', note: 'A note',
    category: null, example_sentence: null, created_at: '2026-01-02',
  };
  render(<NoteRow item={{ kind: 'grammar', note }} categories={['Verbs']} onRemoved={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
  const toggle = screen.getByRole('button', { name: '+ category' });
  expect(screen.queryByRole('combobox', { name: 'Category (optional)' })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  const input = screen.getByRole('combobox', { name: 'Category (optional)' });
  expect(input).toHaveAttribute('list', 'edit-note-category-grammar-2-options');
  expect(document.querySelector('#edit-note-category-grammar-2-options option')).toHaveAttribute('value', 'Verbs');
  fireEvent.change(input, { target: { value: 'Ideas' } });
  fireEvent.click(toggle);
  expect(screen.queryByRole('combobox', { name: 'Category (optional)' })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole('combobox', { name: 'Category (optional)' })).toHaveValue('');
});
