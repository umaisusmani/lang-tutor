'use client';

import { useState } from 'react';

import { Pill } from '@/app/components/pill';
import { notifyError } from '@/app/components/toaster';
import { updateVocabNoteAction } from '@/app/vocab/actions';

export function WordNote({ entryId, initialNote }: { entryId: string; initialNote: string | null }) {
  const [text, setText] = useState(initialNote ?? '');
  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    if (pending) return;
    setPending(true);
    let ok = false;
    try {
      ({ ok } = await updateVocabNoteAction(entryId, draft));
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
      notifyError("Couldn't save this word note. Please try again.", `word-note-${entryId}`);
    }
  }

  return <div className="px-4 pb-9" onClick={(event) => event.stopPropagation()}>
    {editing ? <div className="flex flex-col gap-2">
      <textarea aria-label="Personal word note" value={draft} maxLength={500} rows={3}
        onChange={(event) => setDraft(event.target.value)}
        className="border-hair bg-panel text-ink focus:border-line w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
      {error && <p role="alert" className="text-ink-2 text-sm">Couldn&apos;t save this word note. Please try again.</p>}
      <div className="flex gap-2">
        <Pill hitArea disabled={pending} onClick={() => void save()}>{pending ? 'saving…' : 'Save'}</Pill>
        <Pill hitArea disabled={pending} onClick={() => { setDraft(text); setEditing(false); setError(false); }}>Cancel</Pill>
      </div>
    </div> : <button type="button" onClick={() => setEditing(true)}
      className="text-ink-3 cursor-pointer text-left text-[13px] italic whitespace-pre-wrap hover:underline">
      {text || 'add a note…'}
    </button>}
  </div>;
}
