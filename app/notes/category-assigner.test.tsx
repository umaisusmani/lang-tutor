import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CategoryAssigner } from '@/app/notes/category-assigner';
import { createNoteCategoryAction } from '@/app/vocab/actions';
import type { NoteCategory } from '@/lib/types/db';

vi.mock('@/app/vocab/actions', () => ({ createNoteCategoryAction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const verbs: NoteCategory = { id: 'verbs', user_id: 'user', name: 'Verbs', created_at: '2026-01-01' };
const ideas: NoteCategory = { id: 'ideas', user_id: 'user', name: 'Ideas', created_at: '2026-01-02' };

function assigner(selectedId: string | null = null, onSelect = vi.fn(), onCreated = vi.fn()) {
  return { onSelect, onCreated, view: render(<CategoryAssigner categories={[ideas, verbs]} selectedId={selectedId}
    onSelect={onSelect} onCreated={onCreated} />) };
}

test('opening the popover lists the managed categories', () => {
  assigner();
  fireEvent.click(screen.getByRole('button', { name: 'Add or choose a category' }));
  expect(screen.getByRole('button', { name: 'Ideas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verbs' })).toBeInTheDocument();
});

test('selecting a category closes the popover', () => {
  const { onSelect } = assigner();
  fireEvent.click(screen.getByRole('button', { name: 'Add or choose a category' }));
  fireEvent.click(screen.getByRole('button', { name: 'Verbs' }));
  expect(onSelect).toHaveBeenCalledWith('verbs');
  expect(screen.queryByRole('button', { name: 'Ideas' })).not.toBeInTheDocument();
});

test('creating a category selects the returned row', async () => {
  const created = { ...ideas, id: 'syntax', name: 'Syntax' };
  vi.mocked(createNoteCategoryAction).mockResolvedValue({ ok: true, category: created });
  const { onSelect, onCreated } = assigner();
  fireEvent.click(screen.getByRole('button', { name: 'Add or choose a category' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New category name' }), { target: { value: 'Syntax' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(createNoteCategoryAction).toHaveBeenCalledWith('Syntax'));
  expect(onCreated).toHaveBeenCalledWith(created);
  expect(onSelect).toHaveBeenCalledWith('syntax');
  expect(screen.queryByRole('textbox', { name: 'New category name' })).not.toBeInTheDocument();
});

test('the assigned chip can be removed without opening the popover', () => {
  const { onSelect } = assigner('verbs');
  expect(screen.getByText('Verbs')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove category Verbs' }));
  expect(onSelect).toHaveBeenCalledWith(null);
});
