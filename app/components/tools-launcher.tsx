'use client';

import { useImperativeHandle, useState, type Ref } from 'react';

import { ChatSidePanel } from '@/app/components/chat/side-panel';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { WordGloss } from '@/lib/gloss';
import type { CefrLevel } from '@/lib/prompts';
import type { QuotaStatus } from '@/lib/quota';
import type { VocabSource } from '@/lib/types/db';

type ToolView = 'ask' | 'translate';
export type ToolsLauncherHandle = { open: (view?: ToolView) => void };

export function ToolsLauncher({ canSave, isSaved, onSaveWord, quota, onQuotaChange,
  onQuotaRefresh, level, remaining, messages, onAuthRequired, onOpenRequest, ref }: {
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  quota: QuotaStatus;
  onQuotaChange: (quota: QuotaStatus) => void;
  onQuotaRefresh: () => Promise<void>;
  level: CefrLevel;
  remaining: number | null;
  messages?: LangTutorUIMessage[];
  onAuthRequired: () => void;
  onOpenRequest?: () => void;
  ref?: Ref<ToolsLauncherHandle>;
}) {
  const [open, setOpen] = useState(false);
  const [openOnView, setOpenOnView] = useState<ToolView | undefined>();

  function openPanel(view?: ToolView) {
    setOpenOnView(view);
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ open: openPanel }));

  return <>
    <button type="button" aria-label="Open learning tools" aria-controls="chat-side-panel"
      aria-expanded={open} onClick={() => onOpenRequest ? onOpenRequest() : openPanel()}
      className={`${open ? 'invisible' : ''} border-line bg-paper text-ink fixed top-1/2 right-0 z-20 flex h-12 -translate-y-1/2 items-center gap-1.5 rounded-l-xl border-2 border-r-0 py-2 pr-1 pl-2 font-mono text-[11px] shadow-[-2px_2px_0_var(--line)] transition-colors hover:bg-yellow hover:text-on-bright`}>
      <span>Tools</span><span aria-hidden="true" className="text-base leading-none">‹</span>
    </button>
    <ChatSidePanel open={open} openOnView={openOnView} messages={messages}
      level={level} remaining={remaining} canSave={canSave} isSaved={isSaved}
      onSaveWord={onSaveWord} quota={quota} onQuotaChange={onQuotaChange}
      onQuotaRefresh={onQuotaRefresh} onAuthRequired={() => { setOpen(false); onAuthRequired(); }}
      onClose={() => setOpen(false)} />
  </>;
}
