import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { RemoveWordButton } from '@/app/vocab/remove-word-button';
import { deleteVocabAction } from '@/app/vocab/actions';

const confirm = vi.fn();
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => confirm }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({ deleteVocabAction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('icon-only remove control asks for confirmation before deleting the word', async () => {
  confirm.mockResolvedValue(true);
  vi.mocked(deleteVocabAction).mockResolvedValue({ ok: true });
  render(<RemoveWordButton entryId="word-1" lemma="Haus" />);
  const remove = screen.getByRole('button', { name: 'Remove Haus' });
  expect(remove).toHaveAttribute('title', 'Remove');
  expect(remove).toHaveTextContent('');
  expect(remove.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  fireEvent.click(remove);
  await waitFor(() => expect(deleteVocabAction).toHaveBeenCalledWith('word-1'));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove "Haus"?' }));
  expect(confirm.mock.calls[0][0].description).toMatch(/removes all its review progress/i);
  expect(confirm.mock.calls[0][0].description).toMatch(/Adding it again starts it as a new word/);
  expect(confirm.mock.calls[0][0].description).not.toMatch(/suspend/i);
});

test('remove control stays named and disabled while deletion is pending', async () => {
  confirm.mockResolvedValue(true);
  let finishDelete!: (result: { ok: boolean }) => void;
  vi.mocked(deleteVocabAction).mockImplementation(() => new Promise((resolve) => { finishDelete = resolve; }));
  render(<RemoveWordButton entryId="word-1" lemma="Haus" />);
  const remove = screen.getByRole('button', { name: 'Remove Haus' });
  fireEvent.click(remove);
  await waitFor(() => expect(remove).toBeDisabled());
  expect(remove).toHaveTextContent('');
  await act(async () => { finishDelete({ ok: true }); });
  expect(remove).not.toBeDisabled();
});
