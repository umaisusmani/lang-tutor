import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { EditWord } from '@/app/vocab/edit-word';
import { updateVocabAction } from '@/app/vocab/actions';
import { notifyError } from '@/app/components/toaster';
import type { VocabEntry } from '@/lib/types/db';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/vocab/actions', () => ({ updateVocabAction: vi.fn() }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
const entry: VocabEntry = {
  id: 'word-1', user_id: 'user-1', term: 'Haus', lemma: 'Haus', translation: 'house',
  example_sentence: null, example_translation: null, note: null, source: 'new_word', created_at: '2026-01-01T00:00:00.000Z',
};
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => {
  cleanup(); vi.clearAllMocks();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('requires meaning and saves trimmed fields before closing', async () => {
  vi.mocked(updateVocabAction).mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  render(<EditWord entry={entry} open onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Edit word' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Meaning' }), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(updateVocabAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Meaning' }), { target: { value: '  home  ' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Example sentence' }), { target: { value: '  Das Haus.  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateVocabAction).toHaveBeenCalledWith('word-1', {
    translation: 'home', exampleSentence: 'Das Haus.', exampleTranslation: '',
  }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
});

test('shows an inline error and toast when saving fails', async () => {
  vi.mocked(updateVocabAction).mockResolvedValue({ ok: false });
  render(<EditWord entry={entry} open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t save "Haus"');
  expect(notifyError).toHaveBeenCalledOnce();
});
