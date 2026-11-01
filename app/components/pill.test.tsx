import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Pill } from '@/app/components/pill';

test('chip keeps its tap area, forwards its ref, and can submit a form', () => {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const ref = createRef<HTMLButtonElement>();
  render(<form onSubmit={onSubmit}><Pill ref={ref} type="submit" hitArea>Save</Pill></form>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(ref.current).toBe(button);
  expect(button).toHaveClass('min-h-11');
  expect(button).toHaveClass('group/pill');
  expect(button.firstElementChild).toHaveClass('group-hover/pill:bg-yellow');
  fireEvent.click(button);
  expect(onSubmit).toHaveBeenCalledOnce();
});
