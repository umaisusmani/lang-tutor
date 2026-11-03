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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  activePage = 'chat',
}: {
  userEmail?: string | null;
  dueCount?: number;
  onLevelChange?: (next: CefrLevel) => void;
  activePage?: 'chat' | 'vocab';
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
      activePage={activePage}
    />,
  );
}

function openAccount() {
  fireEvent.click(screen.getByRole('button', { name: 'Account options' }));
  return screen.getByRole('region', { name: 'Account options' });
}

test('chat trigger opens conversations and account keeps saved navigation', () => {
  renderHeader({ dueCount: 3, activePage: 'vocab' });
  expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Proficiency: A2' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /saved/, current: 'page' })).toHaveAttribute('href', '/vocab');
  const chats = screen.getByRole('button', { name: 'chat · 1' });
  expect(screen.queryByRole('link', { name: 'chat' })).not.toBeInTheDocument();
  expect(chats).not.toHaveAttribute('aria-current');
  fireEvent.click(chats);
  const conversations = screen.getByRole('region', { name: 'Conversations' });
  expect(within(conversations).getByRole('link', { name: '+ new chat' })).toBeInTheDocument();
  expect(within(conversations).getByRole('link', { name: 'First conversation' })).toBeInTheDocument();
  expect(within(conversations).getByRole('link', { name: 'First conversation' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Account options' }));
  expect(screen.queryByRole('region', { name: 'Conversations' })).not.toBeInTheDocument();
  const account = screen.getByRole('region', { name: 'Account options' });
  expect(within(account).getByText('Learner')).toBeInTheDocument();
  expect(within(account).getByText('learner@example.com')).toBeInTheDocument();
  expect(within(account).queryByRole('link', { name: 'chat' })).not.toBeInTheDocument();
  expect(within(account).getByRole('link', { name: /saved/, current: 'page' })).toHaveAttribute('href', '/vocab');
  expect(within(account).queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  expect(within(account).getByLabelText('3 words ready to review')).toBeInTheDocument();
  expect(within(account).getByRole('button', { name: 'Toggle color theme' })).toBeInTheDocument();
  expect(within(account).getByRole('button', { name: 'sign out' })).toBeInTheDocument();
});

test('Escape closes account and chats popovers and returns focus to their triggers', () => {
  renderHeader();
  openAccount();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Account options' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Account options' })).toHaveFocus();
  const chats = screen.getByRole('button', { name: 'chat · 1' });
  fireEvent.click(chats);
  expect(within(screen.getByRole('region', { name: 'Conversations' })).getByRole('link', { name: '+ new chat' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(chats).toHaveFocus();
});

test('mobile account menu focuses saved when opened', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  renderHeader();
  const account = openAccount();
  expect(within(account).getByRole('link', { name: 'saved' })).toHaveFocus();
});

test('clicking an account nav link closes the dropdown', () => {
  renderHeader();
  fireEvent.click(within(openAccount()).getByRole('link', { name: /saved/ }));
  expect(screen.queryByRole('region', { name: 'Account options' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Account options' })).toHaveAttribute('aria-expanded', 'false');
});

test('proficiency can be changed from the header row', () => {
  const onLevelChange = vi.fn();
  renderHeader({ onLevelChange });
  fireEvent.click(screen.getByRole('button', { name: 'Proficiency: A2' }));
  fireEvent.click(screen.getByRole('option', { name: 'B1' }));
  expect(onLevelChange).toHaveBeenCalledWith('B1');
});

test('anonymous header exposes proficiency and sign in without account or chat', () => {
  renderHeader({ userEmail: null });
  expect(screen.getByRole('button', { name: 'Proficiency: A2' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Account options' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /chat/ })).not.toBeInTheDocument();
});

test('review indicator sits on the avatar trigger', () => {
  renderHeader({ dueCount: 7 });
  expect(within(screen.getByRole('button', { name: 'Account options' })).getByText('7 words ready to review')).toBeInTheDocument();
});

test('outside click closes account and returns focus to its trigger', () => {
  renderHeader();
  openAccount();
  fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(screen.queryByRole('region', { name: 'Account options' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Account options' })).toHaveFocus();
});
