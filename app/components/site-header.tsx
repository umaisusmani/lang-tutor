'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { signOut } from '@/app/auth/actions';
import { Brand } from '@/app/components/brand';
import { CEFR_LEVELS, isCefrLevel, type CefrLevel } from '@/lib/prompts';
import type { Conversation } from '@/lib/types/db';

export function SiteHeader({
  level,
  onLevelChange,
  userEmail,
  userName,
  conversations,
  conversationId,
  remaining,
  messageCap,
  theme,
  onThemeToggle,
  activePage = 'chat',
}: {
  level: CefrLevel;
  onLevelChange: (next: CefrLevel) => void;
  userEmail: string | null;
  userName: string | null;
  conversations: Conversation[];
  conversationId: string | null;
  remaining: number | null;
  messageCap: number;
  theme?: 'light' | 'dark' | null;
  onThemeToggle?: () => void;
  activePage?: 'chat' | 'vocab';
}) {
  const [chatsOpen, setChatsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!chatsOpen && !accountOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setChatsOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatsOpen, accountOpen]);

  function handleLevelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!isCefrLevel(next)) return;
    onLevelChange(next);
  }

  const progressPct =
    remaining === null ? 0 : Math.round(((messageCap - remaining) / messageCap) * 100);

  return (
    <header className="bg-paper sticky top-0 z-5 flex flex-col gap-3 pt-5 pb-3">
      <div className="flex flex-wrap items-center gap-3">
        <Brand />

        <div className="ml-auto flex items-center gap-3.5">
          <label className="border-line text-ink hover:bg-yellow hover:text-on-bright relative flex items-center rounded-full border-2 text-[13px] font-bold transition-colors duration-150">
            <span className="sr-only">Level</span>
            <select
              value={level}
              onChange={handleLevelChange}
              className="cursor-pointer appearance-none bg-transparent py-1 pr-6 pl-3 text-inherit outline-none"
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l} className="text-ink bg-panel">
                  {l}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-2.5 text-[9px] opacity-60">
              ▾
            </span>
          </label>

          {userEmail && (
            <div className="flex items-center gap-2.5">
              <Link
                href="/"
                className={`font-mono text-xs underline underline-offset-[3px] transition-colors ${
                  activePage === 'chat'
                    ? 'text-ink bg-yellow text-on-bright rounded-full px-2 py-1 no-underline'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                chat
              </Link>
              <Link
                href="/vocab"
                className={`font-mono text-xs underline underline-offset-[3px] transition-colors ${
                  activePage === 'vocab'
                    ? 'text-ink bg-yellow text-on-bright rounded-full px-2 py-1 no-underline'
                    : 'text-ink-2 hover:text-ink'
                }`}
                aria-current={activePage === 'vocab' ? 'page' : undefined}
              >
                vocab
              </Link>
            </div>
          )}

          {userEmail && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  setChatsOpen((v) => !v);
                }}
                className="text-ink-2 hover:text-ink cursor-pointer font-mono text-xs underline underline-offset-[3px]"
              >
                chats{conversations.length > 0 && ` · ${conversations.length}`}
              </button>

              {chatsOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setChatsOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="border-line bg-panel absolute right-0 z-20 mt-2 flex w-[260px] animate-[fade-rise_160ms_ease-out] flex-col rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)]">
                    <Link
                      href="/?c=new"
                      onClick={() => setChatsOpen(true)}
                      className={`rounded-lg px-2.5 py-2 font-mono text-[11px] no-underline ${
                        conversationId === null
                          ? 'bg-yellow text-on-bright'
                          : 'text-ink hover:bg-yellow hover:text-on-bright'
                      }`}
                    >
                      + new chat
                    </Link>

                    {conversations.length > 0 && <div className="bg-hair my-1.5 h-px" />}

                    <div className="flex max-h-[280px] flex-col overflow-y-auto">
                      {conversations.map((c) => (
                        <Link
                          key={c.id}
                          href={`/?c=${c.id}`}
                          onClick={() => setChatsOpen(true)}
                          className={`truncate rounded-lg px-2.5 py-2 text-[13px] no-underline ${
                            c.id === conversationId
                              ? 'bg-yellow text-on-bright font-semibold'
                              : 'text-ink-2 hover:bg-soft hover:text-ink'
                          }`}
                          aria-current={c.id === conversationId ? 'page' : undefined}
                        >
                          {c.title ?? 'Untitled'}
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {userEmail ? (
            <div className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => {
                  setChatsOpen(false);
                  setAccountOpen((v) => !v);
                }}
                className="border-line hover:bg-yellow hover:text-on-bright flex cursor-pointer items-center gap-2 rounded-full border-2 py-[3px] pr-3 pl-[3px] transition-colors duration-150"
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
                    onClick={() => setAccountOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div
                    role="menu"
                    className="border-line bg-panel absolute right-0 z-20 mt-2 flex w-[220px] animate-[fade-rise_160ms_ease-out] flex-col rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)]"
                  >
                    <div className="flex flex-col gap-0.5 px-2.5 py-2">
                      <span className="truncate text-[13px] font-bold">{userName ?? userEmail}</span>
                      <span className="text-ink-3 truncate font-mono text-[10px]">{userEmail}</span>
                    </div>
                    <div className="bg-hair my-1 h-px" />

                    <button
                      type="button"
                      role="menuitem"
                      aria-label="Toggle color theme"
                      onClick={() => onThemeToggle?.()}
                      className="text-ink hover:bg-soft flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium"
                    >
                      <span>theme</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-ink-2">
                          {theme === 'dark' ? 'dark' : 'light'}
                        </span>
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
                        role="menuitem"
                        className="text-ink hover:bg-yellow hover:text-on-bright w-full cursor-pointer rounded-lg px-2.5 py-2 text-left font-mono text-[11px]"
                      >
                        sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-ink-2 hover:text-ink font-mono text-xs underline underline-offset-[3px]"
            >
              sign in
            </Link>
          )}
        </div>
      </div>

      {remaining !== null && (
        <div className="text-ink-3 flex items-center gap-2.5 font-mono text-[10px]">
          <span>free trial</span>
          <div className="bg-soft h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
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
