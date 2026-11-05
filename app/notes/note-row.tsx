'use client';

import { useId, useState, useSyncExternalStore } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';
import { Pill } from '@/app/components/pill';
import { Select } from '@/app/components/select';
import { notifyError } from '@/app/components/toaster';
import { RichEditor } from '@/app/notes/rich-editor';
import { deleteGrammarNoteAction, updateGrammarNoteAction, updateVocabNoteAction } from '@/app/vocab/actions';
import { noteHtmlToPlainText, renderNoteHtml } from '@/lib/sanitize-note-html';
import type { GrammarNote, NoteCategory, VocabEntry } from '@/lib/types/db';

export type NoteItem = { kind: 'grammar'; note: GrammarNote } | { kind: 'word'; note: VocabEntry };

function SafeNoteDisplay({ html }: { html: string }) {
  const inBrowser = useSyncExternalStore(() => () => {}, () => true, () => false);
  return <>{inBrowser ? renderNoteHtml(html) : noteHtmlToPlainText(html)}</>;
}

export function NoteRow({ item, categories, onRemoved, onChanged }: {
  item: NoteItem;
  categories: NoteCategory[];
  onRemoved: () => void;
  onChanged: () => void;
}) {
  const { note } = item;
  const initialText = note.note ?? '';
  const [text, setText] = useState(initialText);
  const [draft, setDraft] = useState(initialText);
  const [category, setCategory] = useState<string | null>(item.kind === 'grammar' ? item.note.category_id : null);
  const [categoryDraft, setCategoryDraft] = useState(category);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const categoryLabelId = useId();
  const confirm = useConfirm();
  const categoryName = item.kind === 'grammar' ? categories.find((entry) => entry.id === category)?.name : undefined;

  async function save() {
    if (pending || !(item.kind === 'grammar' ? noteHtmlToPlainText(draft).trim() : draft.trim())) return;
    setPending(true);
    setError('');
    try {
      const result = item.kind === 'grammar'
        ? await updateGrammarNoteAction(note.id, draft, categoryDraft)
        : await updateVocabNoteAction(note.id, draft);
      if (!result.ok) throw new Error('Save failed');
      setText(draft);
      if (item.kind === 'grammar') setCategory(categoryDraft);
      setEditing(false);
      onChanged();
    } catch {
      setError("Couldn't update this note. Please try again.");
      notifyError("Couldn't update this note. Please try again.", `update-note-${note.id}`);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) return;
    const accepted = await confirm({
      title: 'Remove this note?',
      description: "It'll be removed. You can always add it again later.",
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!accepted) return;
    setPending(true);
    try {
      const result = item.kind === 'grammar'
        ? await deleteGrammarNoteAction(note.id)
        : await updateVocabNoteAction(note.id, '');
      if (!result.ok) throw new Error('Remove failed');
      onRemoved();
    } catch {
      notifyError("Couldn't remove this note. Please try again.", `remove-note-${note.id}`);
    } finally {
      setPending(false);
    }
  }

  return <article className="border-line bg-panel flex w-full flex-col gap-2 rounded-2xl border-2 p-4 shadow-[3px_3px_0_var(--line)]">
    {(item.kind === 'word' || categoryName || !editing) && <div className="flex items-start justify-between gap-2">
      <div>
        {item.kind === 'word' && <span className="bg-soft text-ink-2 inline-block rounded-full px-2 py-0.5 font-mono text-xs">{item.note.lemma}</span>}
        {categoryName && <span className="bg-soft text-ink-2 inline-block rounded-full px-2 py-0.5 font-mono text-xs">{categoryName}</span>}
      </div>
      {!editing && <div className="flex shrink-0 items-center gap-1">
        <button type="button" disabled={pending} onClick={() => setEditing(true)} aria-label="Edit note" title="Edit note"
          className="text-ink-2 hover:bg-soft hover:text-ink rounded-md p-2 disabled:opacity-50">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
        <button type="button" disabled={pending} onClick={() => void remove()} aria-label="Remove note" title="Remove note"
          className="text-ink-2 hover:bg-soft hover:text-accent-ink rounded-md p-2 disabled:opacity-50">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>}
    </div>}
    {editing ? <>
      {item.kind === 'grammar'
        ? <RichEditor label="Edit note" value={draft} onChange={setDraft} />
        : <textarea aria-label="Edit note" value={draft} maxLength={500} rows={4}
          onChange={(event) => setDraft(event.target.value)}
          className="border-hair bg-panel text-ink focus:border-line w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />}
      {item.kind === 'grammar' && <div className="flex flex-col gap-1 text-sm">
        <span id={categoryLabelId}>Category</span>
        <Select variant="panel" value={categoryDraft ?? ''} onValueChange={(value) => setCategoryDraft(value || null)}
          aria-labelledby={categoryLabelId}
          options={[{ value: '', label: 'No category' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
      </div>}
      {error && <p role="alert" className="text-ink-2 text-sm">{error}</p>}
      <div className="flex gap-2">
        <Pill hitArea disabled={pending || !(item.kind === 'grammar' ? noteHtmlToPlainText(draft).trim() : draft.trim())} onClick={() => void save()}>{pending ? 'saving…' : 'Save'}</Pill>
        <Pill hitArea disabled={pending} onClick={() => { setDraft(text); setCategoryDraft(category); setEditing(false); setError(''); }}>Cancel</Pill>
      </div>
    </> : <p className="text-ink text-sm whitespace-pre-wrap break-words">{item.kind === 'grammar' ? <SafeNoteDisplay html={text} /> : text}</p>}
    {item.kind === 'grammar' && item.note.example_sentence &&
      <p className="text-ink-3 text-[13px] italic break-words">{item.note.example_sentence}</p>}
  </article>;
}
