'use client';

import { useTransition } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';
import { Pill } from '@/app/components/pill';
import { notifyError } from '@/app/components/toaster';
import { deleteGrammarNoteAction } from '@/app/vocab/actions';

export function RemoveGrammarNoteButton({ noteId, onRemoved }: { noteId: string; onRemoved: () => void }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    const accepted = await confirm({
      title: 'Remove this note?',
      description: "It'll be deleted. You can always add it again later.",
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!accepted) return;
    startTransition(async () => {
      let ok = false;
      try {
        ({ ok } = await deleteGrammarNoteAction(noteId));
      } catch {
        // A rejected action is handled like an unsuccessful delete.
      }
      if (ok) onRemoved();
      else notifyError("Couldn't remove this note. Please try again.", `remove-note-${noteId}`);
    });
  }

  return <Pill hitArea disabled={pending} muted={pending} onClick={() => void handleClick()} aria-label="Remove note">
    {pending ? 'removing…' : 'remove'}
  </Pill>;
}
