'use client';

import { useEffect, useRef, useState } from 'react';

import { Pill } from '@/app/components/pill';
import type { WordGloss } from '@/lib/gloss';
import type { VocabSource } from '@/lib/types/db';

export function TranslationWords({
  germanText,
  canSave,
  isSaved,
  onSaveWord,
  onRemaining,
  onAuthRequired,
}: {
  germanText: string;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  onRemaining: (remaining: number) => void;
  onAuthRequired: () => void;
}) {
  const [units, setUnits] = useState<WordGloss | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  async function breakDown() {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/translate/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: germanText }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestRef.current !== controller) return;
      if (typeof payload?.remaining === 'number') onRemaining(payload.remaining);
      if (response.status === 401) {
        onAuthRequired();
        return;
      }
      if (!response.ok || !Array.isArray(payload?.units)) {
        setError(payload?.error ?? 'Could not connect. Please try again.');
        return;
      }
      setUnits(payload.units);
    } catch {
      if (requestRef.current === controller) {
        setError('Could not connect. Please try again.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div>
      {units === null && (loading ? (
        <p aria-live="polite" className="text-ink-3 flex min-h-11 items-center font-mono text-[10px]">
          breaking it down…
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void breakDown()}
          className="text-ink-3 hover:text-ink flex min-h-11 items-center cursor-pointer p-0 text-left font-mono text-[10px] whitespace-nowrap transition-colors duration-150"
        >
          save words ↓
        </button>
      ))}
      {error && <p role="alert" className="text-ink text-sm">{error}</p>}
      {units !== null && (units.length === 0 ? (
        <p className="text-ink-3 text-sm">Nothing to save here.</p>
      ) : (
        <ul aria-label="Words to save" className="flex flex-col gap-2">
          {units.map((unit) => {
            const saved = isSaved(unit.lemma);
            return (
              <li key={unit.lemma} className="border-hair bg-panel flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-ink font-semibold break-words">{unit.lemma}</p>
                  <p className="text-ink-2 text-sm">{unit.lemmaTranslation}</p>
                </div>
                <Pill
                  size="sm"
                  muted={!canSave || saved}
                  disabled={!canSave || saved}
                  onClick={() => onSaveWord(unit, 'new_word', germanText)}
                  className="min-h-11 min-w-11 flex-none"
                >
                  {!canSave ? 'sign in' : saved ? '✓ saved' : '+ save'}
                </Pill>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
