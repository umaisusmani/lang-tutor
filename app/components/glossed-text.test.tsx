import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';

import { GlossedText } from '@/app/components/glossed-text';

afterEach(cleanup);

test('portalled word menu stays open when its save chip is pressed', async () => {
  const onSave = vi.fn();
  const word = { word: 'Haus', lemma: 'Haus', lemmaTranslation: 'house', translation: 'house' };
  render(<GlossedText text="Haus" words={[word]} canSave isSaved={() => false} onSave={onSave} />);
  await userEvent.click(screen.getByRole('button', { name: /Haus/ }));
  const menu = screen.getByRole('dialog');
  expect(menu.parentElement).toBe(document.body);
  const save = screen.getByRole('button', { name: '+ save "Haus"' });
  expect(save).toHaveClass('min-h-11');
  await userEvent.click(save);
  expect(onSave).toHaveBeenCalledWith(word);
  expect(menu).toBeInTheDocument();
});

test('word preview follows pointer and keyboard focus', () => {
  render(<GlossedText text="Haus" words={[{ word: 'Haus', lemma: 'Haus', lemmaTranslation: 'house', translation: 'house' }]} canSave isSaved={() => false} onSave={vi.fn()} />);
  const word = screen.getByRole('button', { name: 'Haus' });
  fireEvent.pointerEnter(word);
  expect(screen.getByText('house')).toBeInTheDocument();
  fireEvent.pointerLeave(word);
  expect(screen.queryByText('house')).not.toBeInTheDocument();
  fireEvent.focus(word);
  expect(screen.getByText('house')).toBeInTheDocument();
  fireEvent.blur(word);
  expect(screen.queryByText('house')).not.toBeInTheDocument();
});
