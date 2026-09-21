'use client';

import { useTransition } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';
import { notifyError } from '@/app/components/toaster';
import { deleteVocabAction } from '@/app/vocab/actions';

/**
 * The `remove` control on a /vocab row, now behind a confirmation.
 *
 * Its own client component because the list page is a Server Component, which
 * can't hold an onClick or call useConfirm(). It used to be a bare
 * <form action={deleteVocabAction}>, which deleted on a single stray click.
 *
 * The delete runs inside a transition so `pending` can dim the button until
 * the action's revalidation has re-rendered the list without this row -- the
 * gap where a second click would otherwise be possible.
 */
export function RemoveWordButton({ entryId, lemma }: { entryId: string; lemma: string }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    const ok = await confirm({
      title: `Remove "${lemma}"?`,
      description: "It'll be deleted from your vocab list. You can always save it again later.",
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      let deleted = false;
      try {
        ({ ok: deleted } = await deleteVocabAction(entryId));
      } catch {
        // deleted stays false
      }
      // On success the action's revalidation re-renders the list without
      // this row, so there's nothing to do. On failure the row simply stays,
      // which alone looks like nothing happened -- hence the notice.
      if (!deleted) notifyError(`Couldn't remove "${lemma}". Please try again.`, `remove-${entryId}`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`Remove ${lemma}`}
      className="text-ink-3 hover:text-ink cursor-pointer font-mono text-[11px] underline underline-offset-[3px] disabled:cursor-default disabled:opacity-50"
    >
      {pending ? 'removing…' : 'remove'}
    </button>
  );
}
