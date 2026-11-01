import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { RemoveWordButton } from '@/app/vocab/remove-word-button';
import { deleteVocabAction } from '@/app/vocab/actions';

const confirm = vi.fn();
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => confirm }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/vocab/actions', () => ({ deleteVocabAction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('remove chip asks for confirmation before deleting the word', async () => {
  confirm.mockResolvedValue(true);
  vi.mocked(deleteVocabAction).mockResolvedValue({ ok: true });
  render(<RemoveWordButton entryId="word-1" lemma="Haus" />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Haus' }));
  await waitFor(() => expect(deleteVocabAction).toHaveBeenCalledWith('word-1'));
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Remove "Haus"?' }));
});
