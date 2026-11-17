'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';

import { loadNoteHtml, NOTE_PLAIN_MAX, noteHtmlToPlainText, sanitizeNoteHtml, isNoteWithinLimits } from '@/lib/sanitize-note-html';

const ALLOWED_LINK = /^(https?:|mailto:)/i;
const STRUCTURAL_HTML = /<(table|ul|ol|h[1-6]|pre|blockquote)[\s>]/i;

/** Raw markdown on the clipboard (copied from source, not from rendered output). */
function looksLikeMarkdown(text: string): boolean {
  if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text)) return true;
  const signals = [/^#{1,6}\s+\S/m, /^\s*([-*+]|\d+[.)])\s+\S/m, /\*\*[^*\n]+\*\*/, /^```/m];
  return signals.filter((signal) => signal.test(text)).length >= 2;
}

function plainLength(html: string): number {
  return noteHtmlToPlainText(html).trim().length;
}

function normalizeLink(input: string): string | null {
  const url = input.trim();
  if (!url) return null;
  if (ALLOWED_LINK.test(url)) return url;
  // "example.com/page" -> https://example.com/page, but never invent a scheme for "javascript:..." and the like.
  return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(url) ? `https://${url}` : null;
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function ToolButton({ label, pressed, disabled, onClick, children }: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled}
    onMouseDown={(event) => event.preventDefault()} onClick={onClick}
    className="text-ink-2 hover:bg-soft hover:text-ink aria-pressed:bg-yellow aria-pressed:text-on-bright inline-flex min-w-8 items-center justify-center rounded-md p-1.5 disabled:opacity-40">
    {children}
  </button>;
}

function TableButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}
    className="text-ink-2 hover:bg-soft hover:text-ink rounded-md px-2 py-1 font-mono text-xs">
    {label}
  </button>;
}

function Separator() {
  return <span aria-hidden="true" className="bg-hair mx-0.5 my-1 w-0.5 self-stretch" />;
}

function Toolbar({ editor, linkOpen, setLinkOpen }: {
  editor: Editor;
  linkOpen: boolean;
  setLinkOpen: (open: boolean) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
      strike: current.isActive('strike'), highlight: current.isActive('highlight'),
      h2: current.isActive('heading', { level: 2 }), h3: current.isActive('heading', { level: 3 }),
      bullet: current.isActive('bulletList'), ordered: current.isActive('orderedList'),
      quote: current.isActive('blockquote'), code: current.isActive('code'), codeBlock: current.isActive('codeBlock'),
      link: current.isActive('link'), inTable: current.isActive('table'),
      canUndo: current.can().undo(), canRedo: current.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  return <>
    <div role="toolbar" aria-label="Note formatting" className="border-hair flex flex-wrap items-center gap-0.5 border-b-2 p-1">
      <ToolButton label="Bold" pressed={state.bold} onClick={() => run().toggleBold().run()}>
        <Icon><path d="M6 4h5a3.5 3.5 0 0 1 0 7H6zM6 11h6a3.5 3.5 0 0 1 0 7H6z" fill="currentColor" stroke="none" /></Icon>
      </ToolButton>
      <ToolButton label="Italic" pressed={state.italic} onClick={() => run().toggleItalic().run()}>
        <Icon><path d="M11 4h8M5 20h8M15 4 9 20" /></Icon>
      </ToolButton>
      <ToolButton label="Underline" pressed={state.underline} onClick={() => run().toggleUnderline().run()}>
        <Icon><path d="M6 4v8a6 6 0 0 0 12 0V4M5 21h14" /></Icon>
      </ToolButton>
      <ToolButton label="Strikethrough" pressed={state.strike} onClick={() => run().toggleStrike().run()}>
        <Icon><path d="M5 12h14M16 6.5C15 5 13.5 4.5 12 4.5c-2.5 0-4 1.2-4 3 0 1.2.8 2 2 2.5M8 17.5c1 1.5 2.5 2 4 2 2.5 0 4-1.2 4-3 0-.8-.3-1.4-.8-1.9" /></Icon>
      </ToolButton>
      <ToolButton label="Highlight" pressed={state.highlight} onClick={() => run().toggleHighlight().run()}>
        <Icon><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></Icon>
      </ToolButton>
      <Separator />
      <ToolButton label="Heading 2" pressed={state.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}>
        <span aria-hidden="true" className="font-mono text-xs font-bold">H2</span>
      </ToolButton>
      <ToolButton label="Heading 3" pressed={state.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}>
        <span aria-hidden="true" className="font-mono text-xs font-bold">H3</span>
      </ToolButton>
      <Separator />
      <ToolButton label="Bullet list" pressed={state.bullet} onClick={() => run().toggleBulletList().run()}>
        <Icon><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /></Icon>
      </ToolButton>
      <ToolButton label="Numbered list" pressed={state.ordered} onClick={() => run().toggleOrderedList().run()}>
        <Icon><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></Icon>
      </ToolButton>
      <ToolButton label="Blockquote" pressed={state.quote} onClick={() => run().toggleBlockquote().run()}>
        <Icon><path d="M6 17h3l2-4V7H5v6h3M14 17h3l2-4V7h-6v6h3" /></Icon>
      </ToolButton>
      <Separator />
      <ToolButton label="Inline code" pressed={state.code} onClick={() => run().toggleCode().run()}>
        <Icon><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Icon>
      </ToolButton>
      <ToolButton label="Code block" pressed={state.codeBlock} onClick={() => run().toggleCodeBlock().run()}>
        <Icon><path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2" /></Icon>
      </ToolButton>
      <Separator />
      <ToolButton label="Link" pressed={state.link || linkOpen} onClick={() => setLinkOpen(!linkOpen)}>
        <Icon><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Icon>
      </ToolButton>
      <ToolButton label="Horizontal rule" onClick={() => run().setHorizontalRule().run()}>
        <Icon><path d="M4 12h16" /></Icon>
      </ToolButton>
      <ToolButton label="Insert table" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></Icon>
      </ToolButton>
      <Separator />
      <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => run().undo().run()}>
        <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
      </ToolButton>
      <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => run().redo().run()}>
        <Icon><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
      </ToolButton>
      <ToolButton label="Clear formatting" onClick={() => run().unsetAllMarks().clearNodes().run()}>
        <Icon><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7M5 11l9 9" /></Icon>
      </ToolButton>
    </div>
    {state.inTable && <div role="toolbar" aria-label="Table" className="border-hair flex flex-wrap items-center gap-0.5 border-b-2 p-1">
      <TableButton label="Add row below" onClick={() => run().addRowAfter().run()} />
      <TableButton label="Add column right" onClick={() => run().addColumnAfter().run()} />
      <TableButton label="Delete row" onClick={() => run().deleteRow().run()} />
      <TableButton label="Delete column" onClick={() => run().deleteColumn().run()} />
      <TableButton label="Delete table" onClick={() => run().deleteTable().run()} />
    </div>}
  </>;
}

function LinkField({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState(() => (editor.getAttributes('link').href as string | undefined) ?? '');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function apply() {
    const href = normalizeLink(url);
    if (!href) { setError('Enter an http(s) or mailto link.'); return; }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    onClose();
  }

  return <div className="border-hair flex flex-wrap items-center gap-1.5 border-b-2 p-1.5">
    <input ref={inputRef} type="url" aria-label="Link URL" value={url} placeholder="https://…"
      onChange={(event) => { setUrl(event.target.value); setError(''); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); apply(); }
        if (event.key === 'Escape') { event.preventDefault(); onClose(); editor.commands.focus(); }
      }}
      className="border-hair bg-panel text-ink focus:border-line min-w-0 flex-1 rounded-lg border-2 px-2 py-1 text-sm outline-none" />
    <TableButton label="Apply" onClick={apply} />
    <TableButton label="Remove link" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose(); }} />
    {error && <span role="alert" className="text-ink-2 w-full text-xs">{error}</span>}
  </div>;
}

export function RichEditorImpl({ value, onChange, label, placeholder, minHeight = 'md' }: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  placeholder?: string;
  minHeight?: 'md' | 'lg';
}) {
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  const editorRef = useRef<Editor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [length, setLength] = useState(() => plainLength(value));
  const [tooLong, setTooLong] = useState(() => !isNoteWithinLimits(value));

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    content: loadNoteHtml(value),
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false, autolink: true,
          isAllowedUri: (url) => ALLOWED_LINK.test(url),
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        },
      }),
      Highlight, Table, TableRow, TableHeader, TableCell, Markdown,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    editorProps: {
      attributes: {
        role: 'textbox', 'aria-label': label, 'aria-multiline': 'true',
        class: `note-content text-ink w-full px-3 py-2.5 text-sm break-words outline-none ${minHeight === 'lg' ? 'min-h-56 sm:min-h-72' : 'min-h-28'}`,
      },
      // Strip classes, styles and scripts from pasted HTML before ProseMirror reads it.
      transformPastedHTML: (html) => sanitizeNoteHtml(html),
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData('text/html') ?? '';
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (view.state.selection.$from.parent.type.name === 'codeBlock') return false;
        if (STRUCTURAL_HTML.test(html) || !looksLikeMarkdown(text)) return false;
        event.preventDefault();
        editorRef.current?.chain().focus().insertContent(text, { contentType: 'markdown' }).run();
        return true;
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? '' : sanitizeNoteHtml(current.getHTML());
      lastEmitted.current = html;
      setLength(plainLength(html));
      setTooLong(!isNoteWithinLimits(html));
      onChangeRef.current(html);
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Adopt external changes to `value` (a reset, or a different note) but ignore our own echo.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(loadNoteHtml(value), { emitUpdate: false });
    setLength(plainLength(value));
    setTooLong(!isNoteWithinLimits(value));
  }, [editor, value]);

  return <div className="border-line bg-panel rounded-xl border-2">
    {editor && <Toolbar editor={editor} linkOpen={linkOpen} setLinkOpen={setLinkOpen} />}
    {editor && linkOpen && <LinkField editor={editor} onClose={() => setLinkOpen(false)} />}
    <EditorContent editor={editor} />
    <div className="border-hair flex items-center justify-between gap-2 border-t-2 px-3 py-1">
      {tooLong ? <span role="alert" className="text-accent-ink text-xs">This note is too long.</span> : <span />}
      <span className={`font-mono text-xs ${tooLong ? 'text-accent-ink' : 'text-ink-3'}`}>{length} / {NOTE_PLAIN_MAX}</span>
    </div>
  </div>;
}
