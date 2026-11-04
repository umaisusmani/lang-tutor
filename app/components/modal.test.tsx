import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { Modal } from '@/app/components/modal';

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
});

afterEach(() => {
  cleanup();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

test('opens and closes with the controlled open prop and renders its children', () => {
  const onClose = vi.fn();
  const content = <><p>Any content</p><input aria-label="Custom field" /></>;
  const view = render(<Modal open={false} onClose={onClose} title="Custom title">{content}</Modal>);
  expect(view.container.querySelector('dialog')).not.toHaveAttribute('open');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(<Modal open onClose={onClose} title="Custom title">{content}</Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Custom title' });
  expect(within(dialog).getByText('Any content')).toBeInTheDocument();
  expect(within(dialog).getByRole('textbox', { name: 'Custom field' })).toBeInTheDocument();
  view.rerender(<Modal open={false} onClose={onClose} title="Custom title">{content}</Modal>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(view.container.querySelector('dialog')).not.toHaveAttribute('open');
});

test('Escape requests a close without letting the browser close the dialog', () => {
  const onClose = vi.fn();
  render(<Modal open onClose={onClose} title="Custom title"><p>Content</p></Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Custom title' });
  const cancel = new Event('cancel', { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  expect(dialog).toHaveAttribute('open');
});

test('backdrop clicks request a close, while clicks on content do not', () => {
  const onClose = vi.fn();
  render(<Modal open onClose={onClose} title="Custom title"><button>Inside</button></Modal>);
  const dialog = screen.getByRole('dialog', { name: 'Custom title' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Inside' }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(dialog);
  expect(onClose).toHaveBeenCalledOnce();
});
