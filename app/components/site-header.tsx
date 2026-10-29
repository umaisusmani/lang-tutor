'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { saveTimezone, signOut } from '@/app/auth/actions';
import { Brand } from '@/app/components/brand';
import { useConfirm } from '@/app/components/confirm-modal';
import { WARNING_AT, useResetLabel } from '@/app/components/quota-banner';
import { Select } from '@/app/components/select';
import { notifyError } from '@/app/components/toaster';
import { deleteConversationAction } from '@/app/conversations/actions';
import { CEFR_LEVELS, isCefrLevel, type CefrLevel } from '@/lib/prompts';
import type { Conversation } from '@/lib/types/db';

function ConversationList({ conversations, conversationId, deletingId, onClose, onDelete, mobile = false }: {
  conversations: Conversation[];
  conversationId: string | null;
  deletingId: string | null;
  onClose: () => void;
  onDelete: (chat: Conversation) => void;
  mobile?: boolean;
}) {
  return (
    <>
      <Link
        href="/?c=new"
        onClick={onClose}
        className={`flex min-h-11 items-center rounded-lg px-2.5 py-2 font-mono text-[11px] no-underline ${
          conversationId === null ? 'bg-yellow text-on-bright' : 'text-ink hover:bg-soft'
        }`}
      >
        + new chat
      </Link>
      {conversations.length > 0 && <div className="bg-hair my-1.5 h-px" />}
      <div className={mobile ? 'flex flex-col' : 'flex flex-col overflow-y-auto max-h-[280px]'}>
        {conversations.map((chat) => {
          const current = chat.id === conversationId;
          return (
            <div
              key={chat.id}
              className={`group flex items-center rounded-lg ${
                current ? 'bg-yellow text-on-bright' : 'hover:bg-soft'
              } ${deletingId === chat.id ? 'pointer-events-none opacity-50' : ''}`}
            >
              <Link
                href={`/?c=${chat.id}`}
                onClick={onClose}
                className={`flex min-h-11 min-w-0 flex-1 items-center truncate px-2.5 py-2 text-[13px] no-underline ${
                  current ? 'font-semibold' : 'text-ink-2 group-hover:text-ink'
                }`}
                aria-current={current ? 'page' : undefined}
              >
                {chat.title ?? 'Untitled'}
              </Link>
              <button
                type="button"
                onClick={() => onDelete(chat)}
                aria-label={`Delete chat: ${chat.title ?? 'Untitled'}`}
                title="Delete chat"
                className="mr-1 flex h-6 min-h-11 w-6 min-w-11 flex-none cursor-pointer items-center justify-center rounded-md text-[15px] leading-none opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100 sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function AccountContent({ userEmail, userName, theme, onThemeToggle }: {
  userEmail: string;
  userName: string | null;
  theme?: 'light' | 'dark' | null;
  onThemeToggle?: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[13px] font-bold">{userName ?? userEmail}</span>
        <span className="text-ink-3 truncate font-mono text-[10px]">{userEmail}</span>
      </div>
      <div className="bg-hair my-1 h-px" />
      <button
        type="button"
        aria-label="Toggle color theme"
        onClick={() => onThemeToggle?.()}
        className="text-ink hover:bg-soft flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium"
      >
        <span>theme</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-ink-2">{theme === 'dark' ? 'dark' : 'light'}</span>
          <span
            aria-hidden
            className={`relative inline-flex h-5 w-8 items-center rounded-full border-2 transition-colors ${
              theme === 'dark' ? 'bg-ink border-ink' : 'bg-soft border-line'
            }`}
          >
            <span
              aria-hidden
              className={`h-3.5 w-3.5 rounded-full bg-paper shadow-sm transition-transform ${
                theme === 'dark' ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </span>
      </button>
      <form action={signOut}>
        <button
          type="submit"
          className="text-ink hover:bg-soft min-h-11 w-full cursor-pointer rounded-lg px-2.5 py-2 text-left font-mono text-[11px]"
        >
          sign out
        </button>
      </form>
    </>
  );
}

export function SiteHeader({
  level,
  onLevelChange,
  userEmail,
  userName,
  conversations,
  conversationId,
  remaining,
  messageCap,
  resetsAt,
  theme,
  onThemeToggle,
  activePage = 'chat',
  dueCount = 0,
}: {
  level: CefrLevel;
  onLevelChange: (next: CefrLevel) => void;
  userEmail: string | null;
  userName: string | null;
  conversations: Conversation[];
  conversationId: string | null;
  remaining: number | null;
  messageCap: number;
  resetsAt?: string;
  theme?: 'light' | 'dark' | null;
  onThemeToggle?: () => void;
  activePage?: 'chat' | 'vocab';
  /** Cards waiting in the review queue; the badge on the vocab link. */
  dueCount?: number;
}) {
  const [chatsOpen, setChatsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirm = useConfirm();
  const resetLabel = useResetLabel(resetsAt);
  const router = useRouter();
  const chatsTrigger = useRef<HTMLButtonElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const chatsPanel = useRef<HTMLDivElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);
  const mobilePanel = useRef<HTMLDivElement>(null);

  // Tell the server the learner's timezone once per browser session, so the
  // flashcard day rolls over at 4am where they are, not at 4am UTC.
  useEffect(() => {
    if (!userEmail) return;
    try {
      if (sessionStorage.getItem('starfinch_tz_synced')) return;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) void saveTimezone(zone);
      sessionStorage.setItem('starfinch_tz_synced', '1');
    } catch {
      // Storage or Intl unavailable: the profile keeps its current timezone.
    }
  }, [userEmail]);

  useEffect(() => {
    if (!chatsOpen && !accountOpen && !mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        (mobileOpen ? mobileTrigger : chatsOpen ? chatsTrigger : accountTrigger).current?.focus();
        setChatsOpen(false);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatsOpen, accountOpen, mobileOpen]);

  useEffect(() => {
    const panel = mobileOpen ? mobilePanel.current : chatsOpen ? chatsPanel.current : accountOpen ? accountPanel.current : null;
    panel?.querySelector<HTMLElement>('a[href], button:not([disabled]), select:not([disabled])')?.focus();
  }, [chatsOpen, accountOpen, mobileOpen]);

  function handleLevelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!isCefrLevel(next)) return;
    onLevelChange(next);
  }

  async function handleDeleteChat(chat: Conversation) {
    const ok = await confirm({
      title: 'Delete this chat?',
      description: (
        <>
          &ldquo;{chat.title ?? 'Untitled'}&rdquo; and all of its messages will be permanently
          deleted. Words you saved from it stay in your vocab list.
        </>
      ),
      confirmLabel: 'Delete chat',
      tone: 'danger',
    });
    if (!ok) return;

    setDeletingId(chat.id);
    // A rejected promise (network drop) is a failed delete just like
    // `ok: false`, so both fall through to the same notice below.
    let deleted = false;
    try {
      ({ ok: deleted } = await deleteConversationAction(chat.id));
    } catch {
      // deleted stays false
    } finally {
      setDeletingId(null);
    }

    if (!deleted) {
      notifyError("Couldn't delete that chat. Please try again.", `delete-${chat.id}`);
      return;
    }
    // Only leave once the delete has really happened, and only if the chat
    // being deleted is the one on screen -- deleting a different one from
    // the menu shouldn't yank you out of what you're reading. The action's
    // revalidation has already refreshed this list by the time it returns.
    if (chat.id === conversationId) router.push('/?c=new');
  }

  const progressPct =
    remaining === null ? 0 : Math.round(((messageCap - remaining) / messageCap) * 100);
  const activeNavHighlight =
    "relative z-0 after:absolute after:inset-x-[-2px] after:bottom-[1px] after:-z-10 after:h-[6px] after:rounded-[2px] after:bg-yellow after:content-['']";

  return (
    // Its own 1080px track, wider than the 860px content column below it: the
    // pages render this as a sibling of that column rather than inside it, so
    // the header can spread out while reply text keeps a readable line length.
    <header className="bg-paper sticky top-0 z-5 flex w-full max-w-[1080px] flex-col gap-3 pt-5 pb-3">
      <div className="relative flex items-center gap-3 sm:flex-wrap">
        <Brand />

        <div className="ml-auto flex items-center gap-2 sm:gap-3.5">
          <div className="hidden items-center gap-3.5 sm:flex">
            <label className="flex items-center gap-2">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">Proficiency</span>
              <Select variant="pill" selectClassName="w-[58px]" value={level} onChange={handleLevelChange}>
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l} className="text-ink bg-panel">
                    {l}
                  </option>
                ))}
              </Select>
            </label>

            {userEmail && (
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <Link
                  href="/"
                  className={`flex min-h-11 min-w-11 items-center font-mono text-xs underline underline-offset-[3px] transition-colors ${
                    activePage === 'chat'
                      ? 'text-ink no-underline'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                  aria-current={activePage === 'chat' ? 'page' : undefined}
                >
                  <span className={activePage === 'chat' ? activeNavHighlight : undefined}>chat</span>
                </Link>
                <Link
                  href="/vocab"
                  className={`flex min-h-11 min-w-11 items-center font-mono text-xs underline underline-offset-[3px] transition-colors ${
                    activePage === 'vocab'
                      ? 'text-ink no-underline'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                  aria-current={activePage === 'vocab' ? 'page' : undefined}
                >
                  <span className={activePage === 'vocab' ? activeNavHighlight : undefined}>vocab</span>
                  {dueCount > 0 && (
                    <span
                      className="bg-orange text-on-bright ml-1.5 inline-block min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] leading-[14px] font-bold no-underline"
                      aria-label={`${dueCount} words ready to review`}
                    >
                      {dueCount > 99 ? '99+' : dueCount}
                    </span>
                  )}
                </Link>
              </div>
            )}

            {userEmail && (
              <div className="relative" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setChatsOpen(false);
              }}>
                <button
                  ref={chatsTrigger}
                  type="button"
                  aria-expanded={chatsOpen}
                  aria-controls="conversation-panel"
                  onClick={() => {
                    setAccountOpen(false);
                    setMobileOpen(false);
                    setChatsOpen((v) => !v);
                  }}
                  className="text-ink-2 hover:text-ink min-h-11 min-w-11 cursor-pointer font-mono text-xs underline underline-offset-[3px]"
                >
                  chats{conversations.length > 0 && ` · ${conversations.length}`}
                </button>

                {chatsOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      tabIndex={-1}
                      onClick={() => { setChatsOpen(false); chatsTrigger.current?.focus(); }}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div id="conversation-panel" ref={chatsPanel} role="region" aria-label="Conversations" className="border-line bg-panel absolute right-0 z-20 mt-2 flex w-[260px] animate-[fade-rise_160ms_ease-out] flex-col rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)]">
                      <ConversationList
                        conversations={conversations}
                        conversationId={conversationId}
                        deletingId={deletingId}
                        onClose={() => setChatsOpen(false)}
                        onDelete={handleDeleteChat}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {userEmail && (
              <div className="relative" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountOpen(false);
              }}>
                <button
                  ref={accountTrigger}
                  type="button"
                  aria-label="Account options"
                  aria-controls="account-panel"
                  aria-expanded={accountOpen}
                  onClick={() => {
                    setChatsOpen(false);
                    setMobileOpen(false);
                    setAccountOpen((v) => !v);
                  }}
                  className="border-line hover:bg-soft flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 py-[3px] pr-3 pl-[3px] transition-colors duration-150"
                >
                  <span
                    aria-hidden
                    className="bg-accent text-on-accent flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-extrabold uppercase"
                  >
                    {(userName ?? userEmail).charAt(0)}
                  </span>
                  <span className="hidden max-w-[110px] truncate text-[13px] font-bold sm:block">
                    {userName ?? userEmail}
                  </span>
                  <span aria-hidden className="text-[9px] opacity-60">
                    ▾
                  </span>
                </button>

                {accountOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close menu"
                      tabIndex={-1}
                      onClick={() => { setAccountOpen(false); accountTrigger.current?.focus(); }}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div
                      id="account-panel"
                      ref={accountPanel}
                      role="region"
                      aria-label="Account options"
                      className="border-line bg-panel absolute right-0 z-20 mt-2 flex w-[220px] animate-[fade-rise_160ms_ease-out] flex-col rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)]"
                    >
                      <AccountContent
                        userEmail={userEmail}
                        userName={userName}
                        theme={theme}
                        onThemeToggle={onThemeToggle}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {!userEmail && (
            <Link
              href="/login"
              className="text-ink-2 hover:text-ink flex min-h-11 min-w-11 items-center font-mono text-xs underline underline-offset-[3px]"
            >
              sign in
            </Link>
          )}
          <button
            ref={mobileTrigger}
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => {
              setChatsOpen(false);
              setAccountOpen(false);
              setMobileOpen((open) => !open);
            }}
            className="border-line bg-panel relative flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 sm:hidden"
          >
            <span aria-hidden className={`bg-ink h-0.5 w-5 rounded transition-transform ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
            <span aria-hidden className={`bg-ink h-0.5 w-5 rounded ${mobileOpen ? 'invisible' : ''}`} />
            <span aria-hidden className={`bg-ink h-0.5 w-5 rounded transition-transform ${mobileOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
            {dueCount > 0 && !mobileOpen && (
              <span className="bg-orange border-paper absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2">
                <span className="sr-only">{dueCount} words ready to review</span>
              </span>
            )}
          </button>
        </div>
        {mobileOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={() => { setMobileOpen(false); mobileTrigger.current?.focus(); }}
              className="fixed inset-0 z-10 cursor-default sm:hidden"
            />
            <div
              id="mobile-menu"
              ref={mobilePanel}
              role="region"
              aria-label="Site menu"
              className="border-line bg-panel absolute top-full right-0 left-0 z-20 mt-2 flex max-h-[calc(100dvh-5.5rem)] animate-[fade-rise_160ms_ease-out] flex-col overflow-y-auto overscroll-contain rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)] sm:hidden"
            >
              {userEmail && (
                <>
                  <Link
                    href="/"
                    onClick={() => setMobileOpen(false)}
                    aria-current={activePage === 'chat' ? 'page' : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-2.5 py-2 font-mono text-xs no-underline ${activePage === 'chat' ? 'bg-yellow text-on-bright' : 'text-ink hover:bg-soft'}`}
                  >
                    chat
                  </Link>
                  <Link
                    href="/vocab"
                    onClick={() => setMobileOpen(false)}
                    aria-current={activePage === 'vocab' ? 'page' : undefined}
                    className={`flex min-h-11 items-center rounded-lg px-2.5 py-2 font-mono text-xs no-underline ${activePage === 'vocab' ? 'bg-yellow text-on-bright' : 'text-ink hover:bg-soft'}`}
                  >
                    vocab
                    {dueCount > 0 && (
                      <span
                        className="bg-orange text-on-bright ml-1.5 inline-block min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] leading-[14px] font-bold no-underline"
                        aria-label={`${dueCount} words ready to review`}
                      >
                        {dueCount > 99 ? '99+' : dueCount}
                      </span>
                    )}
                  </Link>
                  <div className="bg-hair my-1.5 h-px" />
                </>
              )}
              <div className="flex flex-col gap-1 px-2.5 py-2">
                <label htmlFor="mobile-proficiency" className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">Proficiency</label>
                <Select id="mobile-proficiency" variant="panel" selectClassName="min-h-11" value={level} onChange={handleLevelChange}>
                  {CEFR_LEVELS.map((l) => (
                    <option key={l} value={l} className="text-ink bg-panel">{l}</option>
                  ))}
                </Select>
              </div>
              {userEmail && (
                <>
                  <div className="bg-hair my-1.5 h-px" />
                  <div className="text-ink-3 px-2.5 py-1 font-mono text-[10px]">chats · {conversations.length}</div>
                  <ConversationList
                    conversations={conversations}
                    conversationId={conversationId}
                    deletingId={deletingId}
                    onClose={() => setMobileOpen(false)}
                    onDelete={handleDeleteChat}
                    mobile
                  />
                  <div className="bg-hair my-1.5 h-px" />
                  <AccountContent
                    userEmail={userEmail}
                    userName={userName}
                    theme={theme}
                    onThemeToggle={onThemeToggle}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>

      {remaining !== null && (
        <div className="text-ink-3 flex items-center gap-2.5 font-mono text-[10px]">
          <span>{userEmail ? 'today' : 'free trial'}</span>
          <div className="bg-soft h-1.5 flex-1 overflow-hidden rounded-full" title={`${remaining} of ${messageCap} messages left${resetsAt ? ` · resets ${resetLabel}` : ''}`}>
            <div
              className={`${remaining <= WARNING_AT ? 'bg-red-600' : 'bg-accent'} h-full rounded-full transition-[width] duration-500 ease-out`}
              style={{ width: remaining === 0 ? '100%' : `${progressPct}%` }}
            />
          </div>
          <span>
            {remaining} of {messageCap} messages left
          </span>
        </div>
      )}

      <div className="bg-line h-0.5 opacity-50" />
    </header>
  );
}
