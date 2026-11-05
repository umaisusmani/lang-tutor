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
    {item.kind === 'word' && <span className="bg-soft text-ink-2 self-start rounded-full px-2 py-0.5 font-mono text-xs">{item.note.lemma}</span>}
    {item.kind === 'grammar' && category && categories.some((item) => item.id === category) &&
      <span className="bg-soft text-ink-2 self-start rounded-full px-2 py-0.5 font-mono text-xs">{categories.find((item) => item.id === category)?.name}</span>}
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
    {!editing && <div className="mt-auto flex items-center justify-between gap-2">
      <Pill hitArea disabled={pending} onClick={() => setEditing(true)} aria-label="Edit note">edit</Pill>
      <Pill hitArea disabled={pending} muted={pending} onClick={() => void remove()} aria-label="Remove note">
        {pending ? 'removing…' : 'remove'}
      </Pill>
    </div>}
  </article>;
}
