'use client';

import { useRef, useState } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';
import { Pill } from '@/app/components/pill';
import { notifyError } from '@/app/components/toaster';
import { CategoryPicker } from '@/app/notes/category-picker';
import { FormatToolbar } from '@/app/notes/format-toolbar';
import { deleteGrammarNoteAction, updateGrammarNoteAction, updateVocabNoteAction } from '@/app/vocab/actions';
import { renderInlineFormat } from '@/lib/inline-format';
import type { GrammarNote, VocabEntry } from '@/lib/types/db';

export type NoteItem = { kind: 'grammar'; note: GrammarNote } | { kind: 'word'; note: VocabEntry };

export function NoteRow({ item, categories, onRemoved, onChanged }: {
  item: NoteItem;
  categories: string[];
  onRemoved: () => void;
  onChanged: (category?: string) => void;
}) {
  const { note } = item;
  const initialText = note.note ?? '';
  const [text, setText] = useState(initialText);
  const [draft, setDraft] = useState(initialText);
  const [category, setCategory] = useState(item.kind === 'grammar' ? item.note.category ?? '' : '');
  const [categoryDraft, setCategoryDraft] = useState(category);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function save() {
    if (pending || !draft.trim()) return;
    setPending(true);
    setError('');
    try {
      const result = item.kind === 'grammar'
        ? await updateGrammarNoteAction(note.id, draft, categoryDraft)
        : await updateVocabNoteAction(note.id, draft);
      if (!result.ok) throw new Error('Save failed');
      setText(draft.trim());
      if (item.kind === 'grammar') setCategory(categoryDraft.trim().slice(0, 40));
      setCategoryOpen(false);
      setEditing(false);
      onChanged(item.kind === 'grammar' ? categoryDraft : undefined);
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
    {item.kind === 'word' && <span className="bg-soft text-ink-2 self-start rounded-full px-2 py-0.5 font-mono text-xs">{item.note.lemma}</span>}
    {item.kind === 'grammar' && category && <span className="bg-soft text-ink-2 self-start rounded-full px-2 py-0.5 font-mono text-xs">{category}</span>}
    {editing ? <>
      {item.kind === 'grammar' && <FormatToolbar textareaRef={textareaRef} value={draft} onChange={setDraft} />}
      <textarea ref={textareaRef} aria-label="Edit note" value={draft} maxLength={500} rows={4}
        onChange={(event) => setDraft(event.target.value)}
        className="border-hair bg-panel text-ink focus:border-line w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
      {item.kind === 'grammar' && !category && <Pill className="self-start" onClick={() => {
        if (categoryOpen) setCategoryDraft('');
        setCategoryOpen(!categoryOpen);
      }} aria-expanded={categoryOpen}>+ category</Pill>}
      {item.kind === 'grammar' && (category || categoryOpen) &&
        <CategoryPicker id={`edit-note-category-${note.id}`} value={categoryDraft}
          onChange={setCategoryDraft} categories={categories} />}
      {error && <p role="alert" className="text-ink-2 text-sm">{error}</p>}
      <div className="flex gap-2">
        <Pill hitArea disabled={pending || !draft.trim()} onClick={() => void save()}>{pending ? 'saving…' : 'Save'}</Pill>
        <Pill hitArea disabled={pending} onClick={() => { setDraft(text); setCategoryDraft(category); setCategoryOpen(false); setEditing(false); setError(''); }}>Cancel</Pill>
      </div>
    </> : <p className="text-ink text-sm whitespace-pre-wrap break-words">{item.kind === 'grammar' ? renderInlineFormat(text) : text}</p>}
    {item.kind === 'grammar' && item.note.example_sentence &&
      <p className="text-ink-3 text-[13px] italic break-words">{item.note.example_sentence}</p>}
    {!editing && <div className="mt-auto flex items-center justify-between gap-2">
      <Pill hitArea disabled={pending} onClick={() => setEditing(true)} aria-label="Edit note">edit</Pill>
      <Pill hitArea disabled={pending} muted={pending} onClick={() => void remove()} aria-label="Remove note">
        {pending ? 'removing…' : 'remove'}
      </Pill>
    </div>}
  </article>;
}
