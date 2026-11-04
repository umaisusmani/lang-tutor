'use client';

import type { RefObject } from 'react';

import { Pill } from '@/app/components/pill';

export function FormatToolbar({ textareaRef, value, onChange }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  function format(marker: '*' | '**', placeholder: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.slice(start, end);
    const inner = selection || placeholder;
    onChange(`${value.slice(0, start)}${marker}${inner}${marker}${value.slice(end)}`);
    textarea.focus();
    queueMicrotask(() => textarea.setSelectionRange(
      start + marker.length,
      start + marker.length + inner.length,
    ));
  }

  return <div className="flex gap-2" role="toolbar" aria-label="Note formatting">
    <Pill aria-label="Bold" className="font-bold" onMouseDown={(event) => event.preventDefault()}
      onClick={() => format('**', 'bold text')}>B</Pill>
    <Pill aria-label="Italic" className="italic" onMouseDown={(event) => event.preventDefault()}
      onClick={() => format('*', 'italic text')}>i</Pill>
  </div>;
}
