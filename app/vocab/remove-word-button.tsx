'use client';

import { useTransition } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';
import { notifyError } from '@/app/components/toaster';
import { deleteVocabAction } from '@/app/vocab/actions';

/**
 * The remove control on a /vocab card, behind a confirmation.
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
      description: 'Deleting this word also removes all its review progress. Adding it again starts it as a new word.',
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
      title="Remove"
      className="text-ink-3 enabled:hover:text-orange focus-visible:text-ink hover:bg-soft focus-visible:bg-soft flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent shadow-none transition-colors disabled:cursor-default disabled:opacity-50"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 4.5h11M6 4.5v-2h4v2m-6.5 0 .6 9h7.8l.6-9M6.5 7v4M9.5 7v4" />
      </svg>
    </button>
  );
}
