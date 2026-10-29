'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Pill } from '@/app/components/pill';
import type { WordGloss } from '@/lib/gloss';
import { stripPunctuation } from '@/lib/text';
import type { VocabSource } from '@/lib/types/db';

type Props = {
  text: string;
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

function Result({ text, canSave, isSaved, onSaveWord, onRemaining, onAuthRequired }: Props) {
  const tokens = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [units, setUnits] = useState<WordGloss | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [openUnit, setOpenUnit] = useState<WordGloss[number] | null>(null);
  const [loadingToken, setLoadingToken] = useState<number | null>(null);
  const pendingTokenRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const resolvedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mapped = useMemo(() => units === null ? null : mapTokensToUnits(tokens, units), [tokens, units]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => {
    if (openUnit === null) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenUnit(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenUnit(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openUnit]);

  async function lookUp(index: number) {
    if (resolvedRef.current) return;
    pendingTokenRef.current = index;
    setLoadingToken(index);
    if (requestRef.current || units !== null) return;

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
        resolvedRef.current = true;
        onAuthRequired();
        return;
      }
      if (!response.ok || !Array.isArray(payload?.units)) {
        setError(payload?.error ?? 'Could not connect. Please try again.');
        setStatus('error');
        return;
      }
      const received = payload.units as WordGloss;
      resolvedRef.current = true;
      setUnits(received);
      setOpenUnit(mapTokensToUnits(tokens, received)[pendingTokenRef.current ?? -1] ?? null);
      setStatus('idle');
    } catch {
      if (requestRef.current === controller) {
        setError('Could not connect. Please try again.');
        setStatus('error');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoadingToken(null);
      }
    }
  }

  return (
    <div ref={rootRef} className="text-ink mt-2 flex flex-wrap gap-x-[0.3em] text-lg leading-relaxed break-words">
      {tokens.map((token, index) => {
        if (mapped === null) {
          return (
            <span key={index} className="relative">
              <button
                type="button"
                onClick={() => void lookUp(index)}
                className="hover:border-accent-ink cursor-pointer border-b-2 border-dashed border-transparent text-left"
              >
                {token}
              </button>
              {status === 'loading' && loadingToken === index && (
                <span aria-live="polite" className="text-ink-3 ml-1 font-mono text-[10px]">looking up…</span>
              )}
            </span>
          );
        }

        const unit = mapped[index];
        if (!unit) return <span key={index}>{token}</span>;
        if (index > 0 && mapped[index - 1] === unit) return null;
        let end = index + 1;
        while (mapped[end] === unit) end++;
        const open = openUnit === unit;
        const saved = isSaved(unit.lemma);
        const showLemma = !!unit.lemma && unit.lemma.toLowerCase() !== unit.word.toLowerCase();

        return (
          <span key={index} className="group relative inline-flex gap-x-[0.3em]">
            <span className={`inline-flex gap-x-[0.3em] border-b-2 border-dashed ${open ? 'border-accent-ink' : 'border-transparent group-hover:border-accent-ink'}`}>
              {tokens.slice(index, end).map((part, offset) => (
                <button
                  key={index + offset}
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenUnit(open ? null : unit)}
                  className="cursor-pointer text-left"
                >
                  {part}
                </button>
              ))}
            </span>
            {!open && (
              <span className="bg-ink text-paper pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-10 -translate-x-1/2 rounded-[7px] px-[9px] py-[3px] font-mono text-xs font-normal whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                {unit.lemmaTranslation}
              </span>
            )}
            {open && (
              <span
                role="dialog"
                aria-label={`${unit.word}: ${unit.lemmaTranslation}`}
                className="border-line bg-panel text-ink absolute top-[calc(100%+7px)] left-1/2 z-20 flex w-max max-w-[240px] -translate-x-1/2 animate-[fade-rise_140ms_ease-out] flex-col gap-1.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm leading-snug shadow-[3px_3px_0_var(--line)]"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold">{unit.word}</span>
                  <span className="text-ink-2 font-mono text-[11px]">{unit.lemmaTranslation}</span>
                </span>
                {showLemma && (
                  <span className="text-ink-3 font-mono text-[10.5px]">
                    dictionary form: <span className="text-ink font-semibold">{unit.lemma}</span>
                  </span>
                )}
                <Pill
                  size="sm"
                  muted={!canSave || saved}
                  disabled={!canSave || saved}
                  onClick={() => onSaveWord(unit, 'new_word', text)}
                  className="self-start"
                >
                  {!canSave ? 'sign in' : saved ? '✓ saved' : '+ save'}
                </Pill>
              </span>
            )}
          </span>
        );
      })}
      {error && <p role="alert" className="text-ink w-full text-sm">{error}</p>}
    </div>
  );
}
