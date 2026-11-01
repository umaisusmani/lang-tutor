'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Pill } from '@/app/components/pill';
import { WordPopover } from '@/app/components/word-popover';
import type { WordGloss } from '@/lib/gloss';
import { stripPunctuation } from '@/lib/text';
import type { VocabSource } from '@/lib/types/db';

type Props = {
  text: string;
  initialUnits?: WordGloss;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  onRemaining: (remaining: number) => void;
  onAuthRequired: () => void;
};

function mapTokensToUnits(tokens: string[], units: WordGloss): Array<WordGloss[number] | null> {
  const assigned: Array<WordGloss[number] | null> = tokens.map(() => null);
  let cursor = 0;
  for (const unit of units) {
    const unitTokens = unit.word.split(/\s+/).filter(Boolean).map((word) => stripPunctuation(word).toLowerCase());
    if (unitTokens.length === 0) continue;
    for (let start = cursor; start <= tokens.length - unitTokens.length; start++) {
      let matches = true;
      for (let k = 0; k < unitTokens.length; k++) {
        if (stripPunctuation(tokens[start + k]).toLowerCase() !== unitTokens[k]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        for (let k = 0; k < unitTokens.length; k++) assigned[start + k] = unit;
        cursor = start + unitTokens.length;
        break;
      }
    }
  }
  return assigned;
}

export function TranslatableResult(props: Props) {
  return <Result key={props.text} {...props} />;
}

function Result({ text, initialUnits, canSave, isSaved, onSaveWord, onRemaining, onAuthRequired }: Props) {
  const tokens = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [units, setUnits] = useState<WordGloss | null>(initialUnits ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const blockedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuAnchorRef = useRef<HTMLElement>(null);
  const previewAnchorRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const mapped = useMemo(() => units === null ? null : mapTokensToUnits(tokens, units), [tokens, units]);
  const selectedUnit = openIndex === null ? null : mapped?.[openIndex] ?? null;
  const previewUnit = previewIndex === null ? null : mapped?.[previewIndex] ?? null;

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => {
    if (openIndex === null) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) setOpenIndex(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenIndex(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openIndex]);

  async function lookUp() {
    if (blockedRef.current || requestRef.current || units !== null) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setError('');

    try {
      const response = await fetch('/api/translate/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestRef.current !== controller) return;
      if (typeof payload?.remaining === 'number') onRemaining(payload.remaining);
      if (response.status === 401) {
        blockedRef.current = true;
        setOpenIndex(null);
        onAuthRequired();
        return;
      }
      if (!response.ok || !Array.isArray(payload?.units)) {
        setError(payload?.error ?? 'Could not connect. Please try again.');
        setStatus('error');
        return;
      }
      setUnits(payload.units as WordGloss);
      setStatus('idle');
    } catch {
      if (requestRef.current === controller) {
        setError('Could not connect. Please try again.');
        setStatus('error');
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function activate(index: number) {
    if (openIndex === index) {
      setOpenIndex(null);
      return;
    }
    setOpenIndex(index);
    if (units === null) void lookUp();
  }

  return (
    <div ref={rootRef} className="text-ink mt-2 flex flex-wrap gap-x-[0.3em] text-lg leading-relaxed break-words">
      {tokens.map((token, index) => {
        if (mapped === null) {
          const open = openIndex === index;
          return (
            <span key={index} ref={open ? menuAnchorRef : undefined} className="relative">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => activate(index)}
                className={`cursor-pointer border-b-2 border-dashed text-left ${open ? 'border-accent-ink' : 'border-accent-ink/40 hover:border-accent-ink focus:border-accent-ink'}`}
              >
                {token}
              </button>
            </span>
          );
        }

        const unit = mapped[index];
        if (!unit) return <span key={index}>{token}</span>;
        if (index > 0 && mapped[index - 1] === unit) return null;
        let end = index + 1;
        while (mapped[end] === unit) end++;
        const open = openIndex !== null && openIndex >= index && openIndex < end;
        const preview = previewIndex === index && !open;

        return (
          <span
            key={index}
            ref={open ? menuAnchorRef : preview ? previewAnchorRef : undefined}
            className="relative inline-flex gap-x-[0.3em]"
            onPointerEnter={() => setPreviewIndex(index)}
            onPointerLeave={() => setPreviewIndex((current) => current === index ? null : current)}
            onFocus={() => setPreviewIndex(index)}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreviewIndex(null); }}
          >
            {tokens.slice(index, end).map((part, offset) => (
              <button
                key={index + offset}
                type="button"
                aria-expanded={open}
                onClick={() => activate(index + offset)}
                className={`cursor-pointer border-b-2 border-dashed text-left ${open ? 'border-accent-ink' : 'border-accent-ink/40 hover:border-accent-ink focus:border-accent-ink'}`}
              >
                {part}
              </button>
            ))}
          </span>
        );
      })}
      {previewUnit && openIndex === null && (
        <WordPopover
          anchorRef={previewAnchorRef}
          preferAbove
          className="bg-ink text-paper pointer-events-none z-[100] rounded-[7px] px-[9px] py-[3px] font-mono text-xs font-normal whitespace-nowrap"
        >
          {previewUnit.lemmaTranslation}
        </WordPopover>
      )}
      {openIndex !== null && (mapped === null || selectedUnit) && (
        <WordPopover
          anchorRef={menuAnchorRef}
          popoverRef={popoverRef}
          role="dialog"
          aria-label={selectedUnit ? `${selectedUnit.word}: ${selectedUnit.lemmaTranslation}` : `Looking up ${tokens[openIndex]}`}
          className="border-line bg-panel text-ink z-[100] flex w-max max-w-[min(240px,calc(100vw-16px))] animate-[fade-rise_140ms_ease-out] flex-col gap-1.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm leading-snug shadow-[3px_3px_0_var(--line)]"
        >
          {selectedUnit ? (
            <>
              <span className="flex items-baseline gap-2">
                <span className="font-semibold">{selectedUnit.word}</span>
                <span className="text-ink-2 font-mono text-[11px]">{selectedUnit.lemmaTranslation}</span>
              </span>
              {selectedUnit.lemma && selectedUnit.lemma.toLowerCase() !== selectedUnit.word.toLowerCase() && (
                <span className="text-ink-3 font-mono text-[10.5px]">
                  dictionary form: <span className="text-ink font-semibold">{selectedUnit.lemma}</span>
                </span>
              )}
              <Pill
                size="sm"
                hitArea
                muted={!canSave || isSaved(selectedUnit.lemma)}
                disabled={!canSave || isSaved(selectedUnit.lemma)}
                onClick={() => onSaveWord(selectedUnit, 'new_word', text)}
                className="self-start"
              >
                {!canSave ? 'sign in' : isSaved(selectedUnit.lemma) ? '✓ saved' : '+ save'}
              </Pill>
            </>
          ) : status === 'error' ? (
            <>
              <span role="alert" className="text-ink text-sm">{error}</span>
              <Pill hitArea onClick={() => void lookUp()} className="self-start">try again</Pill>
            </>
          ) : (
            <span aria-live="polite" className="text-ink-3 font-mono text-[10px]">looking up…</span>
          )}
        </WordPopover>
      )}
    </div>
  );
}
