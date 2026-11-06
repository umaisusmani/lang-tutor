'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/app/components/button';
import { Modal } from '@/app/components/modal';
import { notifyError } from '@/app/components/toaster';
import { updateVocabAction } from '@/app/vocab/actions';
import type { VocabEntry } from '@/lib/types/db';

export function EditWord({ entry, open, onClose }: { entry: VocabEntry; open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Edit word">
    {open && <EditWordForm entry={entry} onClose={onClose} />}
  </Modal>;
}

function EditWordForm({ entry, onClose }: { entry: VocabEntry; onClose: () => void }) {
  const router = useRouter();
  const [translation, setTranslation] = useState(entry.translation ?? '');
  const [exampleSentence, setExampleSentence] = useState(entry.example_sentence ?? '');
  const [exampleTranslation, setExampleTranslation] = useState(entry.example_translation ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const meaning = translation.trim();
    if (!meaning) { setError('Meaning is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await updateVocabAction(entry.id, {
        translation: meaning, exampleSentence: exampleSentence.trim(), exampleTranslation: exampleTranslation.trim(),
      });
      if (!result.ok) throw new Error('Save failed');
      onClose();
      router.refresh();
    } catch {
      const message = `Couldn't save "${entry.lemma}". Please try again.`;
      setError(message);
      notifyError(message, `edit-${entry.id}`);
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
    <h3 className="font-display text-xl break-words">{entry.lemma}</h3>
    <label className="flex flex-col gap-1 text-sm">Meaning
      <input autoFocus required maxLength={500} value={translation} onChange={(event) => setTranslation(event.target.value)}
        className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
    </label>
    <label className="flex flex-col gap-1 text-sm">Example sentence
      <textarea maxLength={500} value={exampleSentence} onChange={(event) => setExampleSentence(event.target.value)}
        className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
    </label>
    <label className="flex flex-col gap-1 text-sm">Example translation
      <textarea maxLength={500} value={exampleTranslation} onChange={(event) => setExampleTranslation(event.target.value)}
        className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
    </label>
    {error && <p role="alert" className="text-orange text-sm">{error}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
  </form>;
}
