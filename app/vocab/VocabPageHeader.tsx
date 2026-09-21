'use client';

import { useEffect, useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import { SiteHeader } from '@/app/components/site-header';
import type { CefrLevel } from '@/lib/prompts';
import type { Conversation } from '@/lib/types/db';

const THEME_KEY = 'starprache_theme';

export function VocabPageHeader({
  initialLevel,
  userEmail,
  userName,
  conversations,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
  userName: string | null;
  conversations: Conversation[];
}) {
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // Ignore storage errors and keep the browser/system preference.
    }
  }, []);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function toggleTheme() {
    const next =
      theme === 'dark'
        ? 'light'
        : theme === 'light'
          ? 'dark'
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'light'
            : 'dark';

    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be unavailable; the toggle still works for the session.
    }
  }

  function handleLevelChange(next: CefrLevel) {
    setLevel(next);
    document.cookie = `cefr_level=${next}; path=/; max-age=31536000; SameSite=Lax`;
    if (userEmail) void saveLevel(next);
  }

  return (
    <SiteHeader
      level={level}
      onLevelChange={handleLevelChange}
      userEmail={userEmail}
      userName={userName}
      conversations={conversations}
      conversationId={null}
      remaining={null}
      messageCap={0}
      theme={theme}
      onThemeToggle={toggleTheme}
      activePage="vocab"
    />
  );
}
