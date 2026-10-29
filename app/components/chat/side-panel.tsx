'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/app/components/button';
import { QuotaBanner } from '@/app/components/quota-banner';
import { TranslationWords } from '@/app/components/chat/translation-words';
import { TranslatableResult } from '@/app/components/chat/translatable-result';
import { isQuotaStatus, quotaFromResponse, type QuotaStatus } from '@/lib/quota';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { WordGloss } from '@/lib/gloss';
import type { CefrLevel } from '@/lib/prompts';
import type { VocabSource } from '@/lib/types/db';
import type { TranslationDirection } from '@/lib/translator';

type ToolView = 'ask' | 'translate';
const toolViews: ToolView[] = ['ask', 'translate'];
const toolViewLabels: Record<ToolView, string> = { ask: 'ask', translate: 'translate' };
type PanelTurn = { role: 'user' | 'assistant'; content: string };

function messageText(message: LangTutorUIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export function ChatSidePanel({
  open,
  openOnView,
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
  /** Which tab to land on the moment the panel opens; left alone (the panel
   * keeps whatever tab was last active) when omitted. */
  openOnView?: ToolView;
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
  // Adjusted during render rather than in an effect (React's recommended
  // pattern for state that depends on a prop change): `wasOpen` lets us tell
  // "just opened" from "still open while re-rendering for other reasons",
  // so re-rendering for, say, a streaming answer doesn't keep snapping the
  // tab back to `openOnView`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && openOnView) setView(openOnView);
  }
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [translationDirection, setTranslationDirection] = useState<TranslationDirection>('de-en');
  const [translationDraft, setTranslationDraft] = useState('');
  const [translationResult, setTranslationResult] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [translationRemaining, setTranslationRemaining] = useState<number | null>(null);
  const [translating, setTranslating] = useState(false);
  const translationRequestRef = useRef<AbortController | null>(null);
  const germanSide = translationDirection === 'de-en' ? translationDraft.trim() : translationResult;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const blocked = quota.reason !== null || remaining === 0;
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.removeAttribute('data-closing');
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = 'true';
    const timer = window.setTimeout(() => {
      dialog.close();
      dialog.removeAttribute('data-closing');
    }, 180);
    return () => window.clearTimeout(timer);
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

  function cancelTranslation() {
    translationRequestRef.current?.abort();
    translationRequestRef.current = null;
    setTranslating(false);
  }

  function swapTranslationDirection() {
    cancelTranslation();
    setTranslationDirection((current) => current === 'de-en' ? 'en-de' : 'de-en');
    setTranslationResult('');
    setTranslationError('');
  }

  async function translate() {
    const text = translationDraft.trim();
    if (!text || translating) return;
    const controller = new AbortController();
    translationRequestRef.current = controller;
    setTranslating(true);
    setTranslationResult('');
    setTranslationError('');

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, direction: translationDirection }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (translationRequestRef.current !== controller) return;
      if (typeof payload?.remaining === 'number') setTranslationRemaining(payload.remaining);
      if (response.status === 401) {
        onAuthRequired();
        return;
      }
      if (!response.ok || typeof payload?.translation !== 'string') {
        setTranslationError(payload?.error ?? 'Translation is unavailable right now.');
        return;
      }
      setTranslationResult(payload.translation);
    } catch {
      if (translationRequestRef.current === controller) {
        setTranslationError('Could not connect. Please try again.');
      }
    } finally {
      if (translationRequestRef.current === controller) {
        translationRequestRef.current = null;
        setTranslating(false);
      }
    }
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
            className="border-hair text-ink-2 hover:bg-yellow hover:text-on-bright flex h-8 min-h-11 w-8 min-w-11 cursor-pointer items-center justify-center rounded-[9px] border-2 font-mono text-lg leading-none"
          >
            ›
          </button>
        </div>

        <div role="tablist" aria-label="Learning tools" className="border-hair flex gap-1 border-b-2 p-2">
          {toolViews.map((tab) => (
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
                const index = toolViews.indexOf(tab);
                const next = event.key === 'Home' ? toolViews[0]
                  : event.key === 'End' ? toolViews.at(-1)!
                    : toolViews[(index + (event.key === 'ArrowRight' ? 1 : -1) + toolViews.length) % toolViews.length];
                setView(next);
                document.getElementById(`tools-tab-${next}`)?.focus();
              }}
              aria-controls={`tools-view-${tab}`}
              onClick={() => changeView(tab)}
              className={`min-h-11 flex-1 cursor-pointer rounded-[9px] px-3 py-[7px] font-mono text-[11px] capitalize transition-colors ${
                view === tab ? 'bg-yellow text-on-bright font-bold' : 'text-ink-2 hover:bg-soft'
              }`}
            >
              {toolViewLabels[tab]}
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
                        className="border-hair text-ink-2 hover:border-line hover:bg-soft min-h-11 rounded-xl border-2 px-3 py-2.5 text-left text-xs leading-relaxed"
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
              <QuotaBanner quota={quota} signedIn={canSave} onRetry={() => void onQuotaRefresh()} compact />
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
                <Button
                  variant="dark"
                  type="submit"
                  disabled={!draft.trim() || sending || blocked}
                >
                  {sending ? 'asking…' : 'ask ↗'}
                </Button>
              </div>
            </form>
          </section>
        ) : (
          <section
            id="tools-view-translate"
            role="tabpanel"
            aria-labelledby="tools-tab-translate"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
          >
            <div className="my-auto flex flex-col gap-5">
              <div>
                <h3 className="font-display text-ink text-[22px] tracking-[0.04em]">Translate</h3>
                <p className="text-ink-2 mt-1 text-sm">A word or short sentence, either way.</p>
              </div>

              <div className="border-hair bg-panel flex items-center justify-between gap-2 rounded-xl border-2 p-2">
                <span className="text-ink flex-1 text-center text-sm font-semibold">
                  {translationDirection === 'de-en' ? 'German' : 'English'}
                </span>
                <button
                  type="button"
                  onClick={swapTranslationDirection}
                  aria-label="Swap translation direction"
                  className="border-hair text-ink-2 hover:bg-yellow hover:text-on-bright min-h-11 min-w-11 cursor-pointer rounded-lg border-2 px-2.5 py-1 font-mono text-lg leading-none"
                >
                  ⇄
                </button>
                <span className="text-ink flex-1 text-center text-sm font-semibold">
                  {translationDirection === 'de-en' ? 'English' : 'German'}
                </span>
              </div>

              <form
                onSubmit={(event) => { event.preventDefault(); void translate(); }}
                className="flex flex-col gap-3"
              >
                <textarea
                  value={translationDraft}
                  onChange={(event) => {
                    cancelTranslation();
                    setTranslationDraft(event.target.value);
                    setTranslationResult('');
                    setTranslationError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void translate();
                    }
                  }}
                  maxLength={200}
                  rows={3}
                  aria-label={`Text to translate from ${translationDirection === 'de-en' ? 'German' : 'English'}`}
                  placeholder={translationDirection === 'de-en' ? 'Type German here…' : 'Type English here…'}
                  className="border-hair bg-panel text-ink placeholder:text-ink-3 focus:border-line w-full resize-none rounded-xl border-2 px-3 py-2.5 text-sm outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-3 font-mono text-[10px]">{translationDraft.length}/200</span>
                  <Button
                    variant="dark"
                    type="submit"
                    disabled={!translationDraft.trim() || translating}
                  >
                    {translating ? 'translating…' : 'translate ↗'}
                  </Button>
                </div>
              </form>

              <div className="border-hair bg-panel min-h-28 rounded-xl border-2 p-4" aria-live="polite">
                <p className="text-ink-3 font-mono text-[10px] uppercase tracking-wide">
                  {translationDirection === 'de-en' ? 'English' : 'German'}
                </p>
                {translationDirection === 'en-de' && translationResult && !translating ? (
                  <TranslatableResult
                    key={germanSide}
                    text={germanSide}
                    canSave={canSave}
                    isSaved={isSaved}
                    onSaveWord={onSaveWord}
                    onRemaining={setTranslationRemaining}
                    onAuthRequired={onAuthRequired}
                  />
                ) : translationResult ? (
                  <p className="text-ink mt-2 text-lg leading-relaxed break-words">{translationResult}</p>
                ) : (
                  <p className="text-ink-3 mt-2 text-sm">{translating ? 'Translating…' : 'Your translation appears here.'}</p>
                )}
              </div>
              {translationDirection === 'de-en' && translationResult && !translating && (
                <TranslationWords
                  key={`${translationDirection}:${germanSide}`}
                  germanText={germanSide}
                  canSave={canSave}
                  isSaved={isSaved}
                  onSaveWord={onSaveWord}
                  onRemaining={setTranslationRemaining}
                  onAuthRequired={onAuthRequired}
                />
              )}
              {translationError && <p role="alert" className="text-ink text-sm">{translationError}</p>}
              {translationRemaining !== null && (
                <p className="text-ink-3 font-mono text-[10px]">
                  {translationRemaining} translations left today · resets at 00:00 UTC
                </p>
              )}
            </div>
          </section>
        )}
        </div>
      </dialog>
  );
}
