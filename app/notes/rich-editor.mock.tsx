'use client';

import { useEffect, useRef } from 'react';

/**
 * Test stand-in for RichEditor: a bare contentEditable that reports its innerHTML.
 * Consumer tests (notes browser, note row, chat card) use it via vi.mock so they test
 * their own behavior; the real Tiptap editor is covered by rich-editor.test.tsx.
 */
export function RichEditor({ value, onChange, label, minHeight = 'md' }: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    if (ref.current && value !== emitted.current) ref.current.innerHTML = value;
  }, [value]);
  return <div ref={ref} role="textbox" aria-label={label} contentEditable suppressContentEditableWarning
    className={minHeight === 'lg' ? 'min-h-56 sm:min-h-72' : 'min-h-28'}
    onInput={(event) => { emitted.current = event.currentTarget.innerHTML; onChange(event.currentTarget.innerHTML); }} />;
}
