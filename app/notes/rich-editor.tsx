'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { sanitizeNoteHtml } from '@/lib/sanitize-note-html';

type Format = 'bold' | 'italic' | 'underline';

export function RichEditor({ value, onChange, label, placeholder, minHeight = 'md' }: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: 'md' | 'lg';
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastAccepted = useRef('');
  const lastEmitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<Format, boolean>>({ bold: false, italic: false, underline: false });

  useEffect(() => {
    if (!editorRef.current || value === lastEmitted.current) return;
    const clean = sanitizeNoteHtml(value);
    editorRef.current.innerHTML = clean;
    lastAccepted.current = clean;
  }, [value]);

  const updateMarks = useCallback(() => {
    if (!document.queryCommandState) return;
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }, []);

  useEffect(() => {
    function onSelectionChange() {
      if (editorRef.current?.contains(document.getSelection()?.anchorNode ?? null)) updateMarks();
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [updateMarks]);

  function sync() {
    const element = editorRef.current;
    if (!element) return;
    if ((element.textContent?.length ?? 0) > 500) {
      element.innerHTML = lastAccepted.current;
      return;
    }
    const clean = sanitizeNoteHtml(element.innerHTML);
    lastAccepted.current = clean;
    lastEmitted.current = clean;
    onChange(clean);
    updateMarks();
  }

  function format(command: Format) {
    // execCommand is deprecated but still supported and keeps this editor dependency-free.
    document.execCommand(command);
    sync();
    updateMarks();
  }

  return <div className="border-line bg-panel rounded-xl border-2">
    <div role="toolbar" aria-label="Note formatting" className="border-hair flex gap-1 border-b-2 p-1">
      {(['bold', 'italic', 'underline'] as const).map((command) =>
        <button key={command} type="button" aria-label={command[0].toUpperCase() + command.slice(1)}
          aria-pressed={active[command]} onMouseDown={(event) => event.preventDefault()}
          onClick={() => format(command)}
          className="text-ink-2 hover:bg-soft hover:text-ink aria-pressed:bg-yellow aria-pressed:text-on-bright rounded-md p-1.5">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {command === 'bold' && <path d="M6 4h5a3.5 3.5 0 0 1 0 7H6zM6 11h6a3.5 3.5 0 0 1 0 7H6z" fill="currentColor" stroke="none" />}
            {command === 'italic' && <><path d="M11 4h8M5 20h8M15 4 9 20" /></>}
            {command === 'underline' && <><path d="M6 4v8a6 6 0 0 0 12 0V4M5 21h14" /></>}
          </svg>
        </button>)}
    </div>
    <div ref={editorRef} role="textbox" aria-label={label} aria-multiline="true" contentEditable
      suppressContentEditableWarning data-placeholder={placeholder}
      onInput={sync} onBlur={() => {
        sync();
        if (editorRef.current) editorRef.current.innerHTML = lastAccepted.current;
      }} onKeyUp={updateMarks} onMouseUp={updateMarks}
      className={`text-ink w-full px-3 py-2.5 text-sm whitespace-pre-wrap break-words outline-none empty:before:text-ink-3 empty:before:content-[attr(data-placeholder)] ${minHeight === 'lg' ? 'min-h-56 sm:min-h-72' : 'min-h-28'}`} />
  </div>;
}
