'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  onRemainingChange,
  prefillQuestion,
  onClose,
}: {
  open: boolean;
  messages: LangTutorUIMessage[];
  level: CefrLevel;
  remaining: number | null;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  onRemainingChange: (remaining: number) => void;
  prefillQuestion: { id: number; text: string } | null;
  onClose: () => void;
}) {
  const [viewState, setViewState] = useState<{ prefillId: number; value: ToolView }>({
    prefillId: 0,
    value: 'ask',
  });
  const [draftState, setDraftState] = useState<{ prefillId: number; value: string }>({
    prefillId: 0,
    value: '',
  });
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [wordFilter, setWordFilter] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasNewPrefill = !!prefillQuestion && viewState.prefillId !== prefillQuestion.id;
  const view = hasNewPrefill ? 'ask' : viewState.value;
  const draft = hasNewPrefill ? prefillQuestion.text.slice(0, 500) : draftState.value;
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
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns, sending, view]);

  function changeView(next: ToolView) {
    setViewState({ prefillId: prefillQuestion?.id ?? 0, value: next });
  }

  function changeDraft(value: string) {
    setDraftState({ prefillId: prefillQuestion?.id ?? 0, value });
  }

  async function ask(question = draft) {
    const text = question.trim();
    if (!text || sending || remaining === 0) return;

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
        const payload = await response.json().catch(() => null);
        if (response.status === 429) onRemainingChange(0);
        const message =
          payload?.error ?? "Couldn't get an answer. Please try again in a moment.";
        setTurns((current) => {
          const next = [...current];
          const last = next.at(-1);
          if (last?.role === 'assistant' && !last.content) last.content = message;
          return next;
        });
        return;
      }

      const left = Number(response.headers.get('X-Messages-Remaining'));
      if (response.headers.has('X-Messages-Remaining') && Number.isFinite(left)) {
        onRemainingChange(left);
      }

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
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close tools panel"
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default bg-black/30 lg:hidden"
      />
      <aside
        id="chat-side-panel"
        aria-label="German learning tools"
        className="border-line bg-paper fixed inset-y-0 right-0 z-40 flex w-[min(94vw,390px)] flex-col border-l-2 shadow-[-5px_0_18px_rgb(0_0_0/0.12)] lg:sticky lg:top-[112px] lg:z-auto lg:my-3 lg:h-[calc(100dvh-128px)] lg:w-[360px] lg:flex-none lg:rounded-[16px] lg:border-2 lg:shadow-[3px_3px_0_var(--line)]"
      >
        <div className="border-hair flex items-center gap-3 border-b-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-ink text-sm font-bold">Learning tools</h2>
            <p className="text-ink-3 font-mono text-[10px]">separate from your chat</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tools panel"
            className="text-ink-2 hover:bg-soft rounded-lg px-2 py-1 font-mono text-xs lg:hidden"
          >
            close
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
              aria-controls={`tools-view-${tab}`}
              onClick={() => changeView(tab)}
              className={`flex-1 rounded-lg px-3 py-2 font-mono text-xs capitalize transition-colors ${
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
                    <p className="text-ink text-lg font-bold">Ask about German</p>
                    <p className="text-ink-2 mt-1 text-sm leading-relaxed">
                      I can use this conversation to explain a word, phrase, or grammar choice.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {['Why did she say “dem” here?', 'What does this phrase mean?', 'How would I say this more naturally?'].map((example) => (
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
              {error && <p className="text-ink-3 font-mono text-[11px]">{error}</p>}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void ask();
              }}
              className="border-hair flex flex-col gap-2 border-t-2 p-3"
            >
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
                placeholder="Ask a question…"
                className="border-hair bg-panel text-ink placeholder:text-ink-3 focus:border-line resize-none rounded-xl border-2 px-3 py-2.5 text-sm outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-3 font-mono text-[10px]">
                  {remaining === 0 ? 'daily limit reached' : `${level} · ${remaining ?? '—'} left`}
                </span>
                <button
                  type="submit"
                  disabled={!draft.trim() || sending || remaining === 0}
                  className="border-line bg-ink text-paper rounded-lg border-2 px-3 py-1.5 font-mono text-xs transition-opacity disabled:cursor-default disabled:opacity-40"
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
      </aside>
    </>
  );
}
