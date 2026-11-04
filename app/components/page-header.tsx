'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveLevel } from '@/app/auth/actions';
import { SiteHeader } from '@/app/components/site-header';
import { ToolsLauncher } from '@/app/components/tools-launcher';
import { notifyError } from '@/app/components/toaster';
import { useQuota } from '@/app/hooks/use-quota';
import { useTheme } from '@/app/hooks/use-theme';
import { saveVocabAction } from '@/app/vocab/actions';
import type { WordGloss } from '@/lib/gloss';
import type { CefrLevel } from '@/lib/prompts';
import type { QuotaStatus } from '@/lib/quota';
import { sentenceContaining } from '@/lib/text';
import type { Conversation, VocabSource } from '@/lib/types/db';

/** The header for the pages that aren't the chat (/vocab and /notes): the same
 * SiteHeader, with the level and theme state the chat page keeps for itself. */
export function PageHeader({
  initialLevel,
  userEmail,
  userName,
  conversations,
  activePage,
  dueCount,
  initialQuota,
  initialSavedLemmas,
}: {
  initialLevel: CefrLevel;
  userEmail: string | null;
  userName: string | null;
  conversations: Conversation[];
  activePage: 'chat' | 'vocab' | 'notes';
  dueCount: number;
  initialQuota: QuotaStatus;
  initialSavedLemmas: string[];
}) {
  const [level, setLevel] = useState<CefrLevel>(initialLevel);
  const [locallySaved, setLocallySaved] = useState<ReadonlySet<string>>(() => new Set());
  const { quota, accept, refresh } = useQuota(initialQuota);
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const savedLemmas = new Set([...initialSavedLemmas, ...locallySaved].map((lemma) => lemma.toLowerCase()));

  async function saveWord(entry: WordGloss[number], source: VocabSource, sourceText: string) {
    const key = entry.lemma.toLowerCase();
    if (!entry.lemma || savedLemmas.has(key)) return;
    setLocallySaved((previous) => new Set(previous).add(key));
    let ok = false;
    try {
      ({ ok } = await saveVocabAction({
        term: entry.word,
        lemma: entry.lemma,
        translation: entry.lemmaTranslation || entry.translation,
        exampleSentence: sentenceContaining(sourceText, entry.word),
      }, source));
    } catch {
      // A dropped request is handled like an unsuccessful save.
    }
    if (!ok) {
      setLocallySaved((previous) => { const next = new Set(previous); next.delete(key); return next; });
      notifyError(`Couldn't save "${entry.lemma}". Please try again.`, `save-${key}`);
    }
  }

  function handleLevelChange(next: CefrLevel) {
    setLevel(next);
    document.cookie = `cefr_level=${next}; path=/; max-age=31536000; SameSite=Lax`;
    if (userEmail) void saveLevel(next);
  }

  return <>
    <SiteHeader
      level={level}
      onLevelChange={handleLevelChange}
      userEmail={userEmail}
      userName={userName}
      conversations={conversations}
      conversationId={null}
      remaining={null}
      messageCap={quota.cap}
      theme={theme}
      onThemeToggle={toggleTheme}
      activePage={activePage}
      dueCount={dueCount}
    />
    <ToolsLauncher canSave isSaved={(lemma) => savedLemmas.has(lemma.toLowerCase())}
      onSaveWord={saveWord} quota={quota} onQuotaChange={accept} onQuotaRefresh={refresh}
      level={level} remaining={quota.remaining} onAuthRequired={() => router.push('/login')} />
  </>;
}
