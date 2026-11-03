'use client';

import { useState } from 'react';

import { Pill } from '@/app/components/pill';
import { notifyError } from '@/app/components/toaster';
import { updateGrammarNoteAction } from '@/app/vocab/actions';
import { RemoveGrammarNoteButton } from '@/app/vocab/remove-grammar-note-button';
import type { GrammarNote } from '@/lib/types/db';

export function GrammarNoteCard({ note, onRemoved }: { note: GrammarNote; onRemoved: () => void }) {
  const [text, setText] = useState(note.note);
  const [draft, setDraft] = useState(note.note);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    if (pending || !draft.trim()) return;
    setPending(true);
    let ok = false;
    try {
      ({ ok } = await updateGrammarNoteAction(note.id, draft));
    } catch {
      // A rejected action is handled like an unsuccessful save.
    }
    setPending(false);
    if (ok) {
      setText(draft.trim());
      setEditing(false);
      setError(false);
    } else {
      setError(true);
      notifyError("Couldn't update this note. Please try again.", `update-note-${note.id}`);
    }
  }

  return <div className="border-line bg-panel flex min-h-[112px] flex-col gap-2 rounded-[14px] border-2 p-4 shadow-[3px_3px_0_var(--line)]">
    {editing ? <>
      <textarea aria-label="Edit grammar note" value={draft} maxLength={500} rows={4}
        onChange={(event) => setDraft(event.target.value)}
        className="border-hair bg-panel text-ink focus:border-line w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
      {error && <p role="alert" className="text-ink-2 text-sm">Couldn&apos;t update this note. Please try again.</p>}
      <div className="flex gap-2">
        <Pill hitArea disabled={pending || !draft.trim()} onClick={() => void save()}>{pending ? 'saving…' : 'Save'}</Pill>
        <Pill hitArea disabled={pending} onClick={() => { setDraft(text); setEditing(false); setError(false); }}>Cancel</Pill>
      </div>
    </> : <p className="text-ink text-sm whitespace-pre-wrap break-words">{text}</p>}
    {note.example_sentence && <p className="text-ink-3 text-[13px] italic break-words">{note.example_sentence}</p>}
    {!editing && <div className="mt-auto flex items-center justify-between gap-2">
      <Pill hitArea onClick={() => setEditing(true)} aria-label="Edit note">edit</Pill>
      <RemoveGrammarNoteButton noteId={note.id} onRemoved={onRemoved} />
    </div>}
  </div>;
}
