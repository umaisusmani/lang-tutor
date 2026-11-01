import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { Select } from '@/app/components/select';

afterEach(cleanup);

const options = [
  { value: 'a', label: 'All words' },
  { value: 'b', label: 'Ready to review' },
  { value: 'c', label: 'Corrections' },
];

function setup() {
  const onValueChange = vi.fn();
  function Controlled() {
    const [value, setValue] = useState('a');
    return (
      <Select variant="panel" value={value} options={options} aria-label="Show words"
        onValueChange={(next) => { onValueChange(next); setValue(next); }} />
    );
  }
  render(<><Controlled /><button type="button">Outside</button></>);
  return { trigger: screen.getByRole('button', { name: 'Show words: All words' }), onValueChange };
}

test('click opens the list and clicking an option changes the visible selection', () => {
  const { trigger, onValueChange } = setup();
  fireEvent.click(trigger);
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Corrections' }));
  expect(onValueChange).toHaveBeenCalledWith('c');
  expect(trigger).toHaveTextContent('Corrections');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('ArrowDown opens and keyboard selection changes the visible label', () => {
  const { trigger, onValueChange } = setup();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const list = screen.getByRole('listbox');
  expect(list).toHaveFocus();
  expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Ready to review' }).id);
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onValueChange).toHaveBeenCalledWith('b');
  expect(trigger).toHaveTextContent('Ready to review');
});

test('Escape closes and returns focus; clicking outside also closes', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Home, End, and letter keys move the active option', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  const list = screen.getByRole('listbox');
  fireEvent.keyDown(list, { key: 'End' });
  expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Corrections' }).id);
  fireEvent.keyDown(list, { key: 'Home' });
  fireEvent.keyDown(list, { key: 'r' });
  expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Ready to review' }).id);
});

test('selected option alone is yellow and checked while keyboard active option is soft', () => {
  const { trigger } = setup();
  fireEvent.click(trigger);
  const selected = screen.getByRole('option', { name: 'All words' });
  expect(selected).toHaveClass('bg-yellow', 'text-on-bright');
  expect(selected).toHaveTextContent('✓');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
  const active = screen.getByRole('option', { name: 'Ready to review' });
  expect(active).toHaveClass('bg-soft', 'text-ink');
  expect(active).not.toHaveClass('bg-yellow');
  expect(active).not.toHaveTextContent('✓');
  expect(selected).toHaveClass('bg-yellow');
});
