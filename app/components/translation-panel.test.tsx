import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { TranslateButton, TranslationPanel } from '@/app/components/translation-panel';

test('explain chip toggles and pending state blocks another action', () => {
  const onToggle = vi.fn();
  const { rerender } = render(<TranslateButton open={false} onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: 'explain' }));
  expect(onToggle).toHaveBeenCalledOnce();
  rerender(<TranslateButton open onToggle={onToggle} />);
  expect(screen.getByRole('button', { name: 'hide' })).toBeInTheDocument();
  rerender(<TranslateButton open pending onToggle={onToggle} />);
  fireEvent.click(screen.getByRole('button', { name: 'explain' }));
  expect(onToggle).toHaveBeenCalledOnce();
});

test('grammar chip requests the explanation', () => {
  const onExplain = vi.fn();
  render(<TranslationPanel open translation="A translation" explanation={undefined} explaining={false} onExplain={onExplain} />);
  fireEvent.click(screen.getByRole('button', { name: 'explain grammar ↓' }));
  expect(onExplain).toHaveBeenCalledOnce();
});
