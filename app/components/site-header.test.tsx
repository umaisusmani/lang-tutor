import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { SiteHeader } from '@/app/components/site-header';
import type { CefrLevel } from '@/lib/prompts';
import type { Conversation } from '@/lib/types/db';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/auth/actions', () => ({ saveTimezone: vi.fn(), signOut: vi.fn() }));
vi.mock('@/app/conversations/actions', () => ({ deleteConversationAction: vi.fn() }));
vi.mock('@/app/components/toaster', () => ({ notifyError: vi.fn() }));
vi.mock('@/app/components/confirm-modal', () => ({ useConfirm: () => vi.fn() }));

afterEach(cleanup);

const conversation: Conversation = {
  id: 'chat-1',
  user_id: 'user-1',
  title: 'First conversation',
  persona_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

function renderHeader({
  userEmail = 'learner@example.com',
  dueCount = 0,
  onLevelChange = vi.fn(),
}: {
  userEmail?: string | null;
  dueCount?: number;
  onLevelChange?: (next: CefrLevel) => void;
} = {}) {
  render(
    <SiteHeader
      level="A2"
      onLevelChange={onLevelChange}
      userEmail={userEmail}
      userName="Learner"
      conversations={[conversation]}
      conversationId={conversation.id}
      remaining={null}
      messageCap={0}
      dueCount={dueCount}
    />,
  );
}

function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Open menu' });
  fireEvent.click(trigger);
  return screen.getByRole('region', { name: 'Site menu' });
}

test('signed-in mobile menu shows navigation, proficiency, chats, and account', () => {
  renderHeader({ dueCount: 3 });
  const menu = openMenu();
  expect(screen.getByRole('button', { name: 'Close menu', expanded: true })).toHaveAttribute('aria-controls', 'mobile-menu');
  expect(within(menu).getByRole('link', { name: 'chat', current: 'page' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: /vocab/ })).toBeInTheDocument();
  expect(within(menu).getByLabelText('Proficiency')).toHaveValue('A2');
  expect(within(menu).getByText('chats · 1')).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: '+ new chat' })).toBeInTheDocument();
  expect(within(menu).getByRole('link', { name: 'First conversation' })).toBeInTheDocument();
  expect(within(menu).getByRole('button', { name: 'Delete chat: First conversation' })).toBeInTheDocument();
  expect(within(menu).getByRole('button', { name: 'sign out' })).toBeInTheDocument();
});

test('Escape closes the mobile menu and returns focus to its trigger', () => {
  renderHeader();
  const menu = openMenu();
  expect(within(menu).getByRole('link', { name: 'chat' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Site menu' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
});

test('clicking a mobile menu link closes the disclosure', () => {
  renderHeader();
  const menu = openMenu();
  fireEvent.click(within(menu).getByRole('link', { name: /vocab/ }));
  expect(screen.queryByRole('region', { name: 'Site menu' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
});

test('mobile proficiency selection updates the level', () => {
  const onLevelChange = vi.fn();
  renderHeader({ onLevelChange });
  fireEvent.change(within(openMenu()).getByLabelText('Proficiency'), { target: { value: 'B1' } });
  expect(onLevelChange).toHaveBeenCalledWith('B1');
});

test('signed-out mobile menu only shows proficiency', () => {
  renderHeader({ userEmail: null });
  expect(screen.getByRole('link', { name: 'sign in' })).toBeInTheDocument();
  const menu = openMenu();
  expect(within(menu).getByLabelText('Proficiency')).toHaveValue('A2');
  expect(within(menu).queryByRole('link')).not.toBeInTheDocument();
  expect(within(menu).queryByRole('button', { name: 'sign out' })).not.toBeInTheDocument();
  expect(within(menu).queryByText(/chats ·/)).not.toBeInTheDocument();
});

test('closed hamburger shows the review indicator when words are due', () => {
  renderHeader({ dueCount: 7 });
  const trigger = screen.getByRole('button', { name: 'Open menu' });
  expect(within(trigger).getByText('7 words ready to review')).toBeInTheDocument();
  openMenu();
  expect(screen.queryByText('7 words ready to review')).not.toBeInTheDocument();
});

test('opening the mobile menu closes a desktop popover', () => {
  renderHeader();
  fireEvent.click(screen.getByRole('button', { name: 'chats · 1' }));
  expect(screen.getByRole('region', { name: 'Conversations' })).toBeInTheDocument();
  openMenu();
  expect(screen.queryByRole('region', { name: 'Conversations' })).not.toBeInTheDocument();
});
