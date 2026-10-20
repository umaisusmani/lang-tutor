'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { QuotaBanner } from '@/app/components/quota-banner';
import { isQuotaStatus, quotaFromResponse, type QuotaStatus } from '@/lib/quota';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { WordGloss } from '@/lib/gloss';
import type { CefrLevel } from '@/lib/prompts';
import type { VocabSource } from '@/lib/types/db';

type ToolView = 'ask' | 'words';
type PanelTurn = { role: 'user' | 'assistant'; content: string };
type PanelWord = {
  entry: WordGloss[number];
  source: VocabSource;
  sourceText: string;
};

function messageText(message: LangTutorUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function collectWords(messages: LangTutorUIMessage[]): PanelWord[] {
  const byLemma = new Map<string, PanelWord>();

  for (const message of messages) {
    const text = messageText(message);
    for (const part of message.parts) {
      if (part.type === 'data-gloss') {
        for (const entry of part.data.words ?? []) {
          if (entry.lemma && !byLemma.has(entry.lemma.toLowerCase())) {
            byLemma.set(entry.lemma.toLowerCase(), { entry, source: 'new_word', sourceText: text });
          }
        }
      } else if (part.type === 'data-correction' && part.data.correctionGloss) {
        const correctionText = part.data.correction ?? text;
        for (const entry of part.data.correctionGloss) {
          if (entry.lemma && !byLemma.has(entry.lemma.toLowerCase())) {
            byLemma.set(entry.lemma.toLowerCase(), {
              entry,
              source: 'mistake',
              sourceText: correctionText,
            });
          }
        }
      }
    }
  }

  return [...byLemma.values()];
}

export function ChatSidePanel({
  open,
  messages,
  level,
  remaining,
  canSave,
  isSaved,
  onSaveWord,
  quota,
  onQuotaChange,
  onQuotaRefresh,
  onAuthRequired,
  onClose,
}: {
  open: boolean;
  messages: LangTutorUIMessage[];
  level: CefrLevel;
  remaining: number | null;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  quota: QuotaStatus;
  onQuotaChange: (quota: QuotaStatus) => void;
  onQuotaRefresh: () => Promise<void>;
  onAuthRequired: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<ToolView>('ask');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [wordFilter, setWordFilter] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const blocked = quota.reason !== null || remaining === 0;
  const transcriptRef = useRef<HTMLDivElement>(null);
  const words = useMemo(() => collectWords(messages), [messages]);
  const visibleWords = useMemo(() => {
    const query = wordFilter.trim().toLocaleLowerCase();
    if (!query) return words;
    return words.filter(({ entry }) =>
      `${entry.word} ${entry.lemma} ${entry.lemmaTranslation} ${entry.translation}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [wordFilter, words]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns, sending, view]);

  function changeView(next: ToolView) {
    setView(next);
  }

  function changeDraft(value: string) {
    setDraft(value);
  }

  async function ask(question = draft) {
    const text = question.trim();
    if (!text || sending || blocked) return;

    setError('');
    changeDraft('');
    setSending(true);
    changeView('ask');
    setTurns((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          level,
          chatContext: messages.slice(-6).map((message) => ({
            role: message.role,
            content: messageText(message),
          })),
          panelContext: turns.slice(-4),
        }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          setTurns((current) => current.slice(0, -2));
          changeDraft(text);
          onAuthRequired();
          return;
        }
        const payload = await response.json().catch(() => null);
        if (isQuotaStatus(payload?.quota)) onQuotaChange(payload.quota);
        setError(payload?.error ?? "Couldn't get an answer. Please try again in a moment.");
        setTurns((current) => current.slice(0, -2));
        changeDraft(text);
        return;
      }

      const updatedQuota = quotaFromResponse(response);
      if (updatedQuota) onQuotaChange(updatedQuota);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setTurns((current) => {
          const next = [...current];
          const last = next.at(-1);
          if (last?.role === 'assistant') last.content = answer;
          return next;
        });
      }
      answer += decoder.decode();
      if (!answer.trim()) setError("The answer came back empty. Try asking another way.");
    } catch {
      setTurns((current) => {
        const next = [...current];
        const last = next.at(-1);
        if (last?.role === 'assistant' && !last.content) {
          last.content = "Couldn't connect. Please try again.";
        }
        return next;
      });
    } finally {
      setSending(false);
      void onQuotaRefresh();
    }
  }

  return (
      <dialog
        ref={dialogRef}
        id="chat-side-panel"
        aria-label="German learning tools"
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        className="border-line bg-paper text-ink fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[min(94vw,420px)] max-w-none border-0 border-l-2 p-0 backdrop:bg-black/40"
      >
        <div className="flex h-full min-h-0 flex-col">
        <div className="border-hair flex items-center gap-3 border-b-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-ink text-xl tracking-[0.04em]">Learning tools</h2>
            <p className="text-ink-3 font-mono text-[10px]">separate from your chat</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close learning panel"
            className="border-hair text-ink-2 hover:bg-yellow hover:text-on-bright flex h-8 w-8 cursor-pointer items-center justify-center rounded-[9px] border-2 font-mono text-lg leading-none"
          >
            ›
          </button>
        </div>

        <div role="tablist" aria-label="Learning tools" className="border-hair flex gap-1 border-b-2 p-2">
          {(['ask', 'words'] as const).map((tab) => (
            <button
              key={tab}
              id={`tools-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={view === tab}
              tabIndex={view === tab ? 0 : -1}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next: ToolView = event.key === 'Home' ? 'ask' : event.key === 'End' ? 'words' : view === 'ask' ? 'words' : 'ask';
                setView(next);
                document.getElementById(`tools-tab-${next}`)?.focus();
              }}
              aria-controls={`tools-view-${tab}`}
              onClick={() => changeView(tab)}
              className={`flex-1 cursor-pointer rounded-[9px] px-3 py-[7px] font-mono text-[11px] capitalize transition-colors ${
                view === tab ? 'bg-yellow text-on-bright font-bold' : 'text-ink-2 hover:bg-soft'
              }`}
            >
              {tab}{tab === 'words' ? ` · ${words.length}` : ''}
            </button>
          ))}
        </div>

        {view === 'ask' ? (
          <section
            id="tools-view-ask"
            role="tabpanel"
            aria-labelledby="tools-tab-ask"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {turns.length === 0 ? (
                <div className="my-auto flex flex-col gap-4">
                  <div>
                    <p className="font-display text-ink text-[22px] tracking-[0.04em]">
                      Ask about German
                    </p>
                    <p className="text-ink-2 mt-1 text-sm leading-relaxed">
                      Ask a question or paste a German sentence for a quick translation and grammar note.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {['How do I say “See you tomorrow” in German?', 'What does “Guten Appetit” mean?', 'How do I greet a friend in German?'].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => changeDraft(example)}
                        className="border-hair text-ink-2 hover:border-line hover:bg-soft rounded-xl border-2 px-3 py-2.5 text-left text-xs leading-relaxed"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((turn, index) => (
                  <div
                    key={`${index}-${turn.role}`}
                    className={`max-w-[92%] rounded-[13px] px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      turn.role === 'user'
                        ? 'border-line bg-yellow text-on-bright self-end border-2'
                        : 'border-hair bg-panel text-ink self-start border-2'
                    }`}
                  >
                    {turn.content || (sending && index === turns.length - 1 ? 'thinking…' : '')}
                  </div>
                ))
              )}
              {error && <p role="alert" className="text-ink text-sm">{error}</p>}
            </div>

            <p className="sr-only" role="status">{sending ? 'Asking…' : turns.length > 0 ? 'Answer ready.' : ''}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask();
              }}
              className="border-hair flex flex-col gap-2 border-t-2 p-3"
            >
              <QuotaBanner quota={quota} signedIn={canSave} onRetry={() => void onQuotaRefresh()} />
              <textarea
                value={draft}
                onChange={(event) => changeDraft(event.target.value.slice(0, 500))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask();
                  }
                }}
                maxLength={500}
                rows={2}
                aria-label="Ask a German question"
                placeholder="Ask or paste a sentence…"
                className="border-hair bg-panel text-ink placeholder:text-ink-3 focus:border-line resize-none rounded-xl border-2 px-3 py-2.5 text-sm outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-3 font-mono text-[10px]">
                  {blocked ? 'messages paused' : `${level} · ${remaining ?? '—'} left`}
                </span>
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || blocked}
                  className="border-line bg-ink text-paper font-display cursor-pointer rounded-lg border-2 px-3 py-[5px] text-[15px] tracking-[0.04em] transition-opacity disabled:cursor-default disabled:opacity-40"
                >
                  {sending ? 'asking…' : 'ask ↗'}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <section
            id="tools-view-words"
            role="tabpanel"
            aria-labelledby="tools-tab-words"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-hair border-b p-3">
              <input
                value={wordFilter}
                onChange={(event) => setWordFilter(event.target.value)}
                type="search"
                aria-label="Filter conversation words"
                placeholder="Find a word…"
                className="border-hair bg-panel text-ink placeholder:text-ink-3 focus:border-line w-full rounded-xl border-2 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {visibleWords.length === 0 ? (
                <p className="text-ink-3 m-auto max-w-[26ch] text-center text-sm leading-relaxed">
                  {words.length === 0
                    ? 'Words explained by the tutor will show up here.'
                    : 'No words match that search.'}
                </p>
              ) : (
                visibleWords.map(({ entry, source, sourceText }, index) => (
                  <article key={`${entry.lemma}-${index}`} className="border-hair bg-panel rounded-xl border-2 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink font-semibold">{entry.word}</p>
                        <p className="text-ink-2 mt-0.5 text-sm">{entry.translation}</p>
                        {entry.lemma && entry.lemma.toLowerCase() !== entry.word.toLowerCase() && (
                          <p className="text-ink-3 mt-1 font-mono text-[10px]">
                            {entry.lemma} · {entry.lemmaTranslation || entry.translation}
                          </p>
                        )}
                      </div>
                      {entry.lemma && (
                        <button
                          type="button"
                          disabled={!canSave || isSaved(entry.lemma)}
                          onClick={() => onSaveWord(entry, source, sourceText)}
                          className="border-line text-ink-2 hover:bg-yellow hover:text-on-bright flex-none rounded-lg border-2 px-2 py-1 font-mono text-[10px] disabled:cursor-default disabled:opacity-50"
                        >
                          {!canSave ? 'sign in' : isSaved(entry.lemma) ? '✓ saved' : '+ save'}
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}
        </div>
      </dialog>
  );
}
