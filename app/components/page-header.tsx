'use client';

import { useState } from 'react';

import { saveLevel } from '@/app/auth/actions';
import { SiteHeader } from '@/app/components/site-header';
import { useTheme } from '@/app/hooks/use-theme';
import type { CefrLevel } from '@/lib/prompts';
import type { Conversation } from '@/lib/types/db';

/** The header for the pages that aren't the chat (/vocab): the same
 * SiteHeader, with the level and theme state the chat page keeps for itself. */
export function PageHeader({
  initialLevel,
  userEmail,
  userName,
  conversations,
  activePage,
  dueCount,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
  userName: string | null;
  conversations: Conversation[];
  activePage: 'vocab';
  dueCount: number;
}) {
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const { theme, toggleTheme } = useTheme();

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
      activePage={activePage}
      dueCount={dueCount}
    />
  );
}
