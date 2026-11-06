'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Pill } from '@/app/components/pill';
import { notifyError } from '@/app/components/toaster';
import { setWordSuspendedAction } from '@/app/vocab/actions';

export function SuspendWordButton({ entryId, lemma, suspended }: { entryId: string; lemma: string; suspended: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Pill hitArea disabled={pending} muted={pending} aria-label={`${suspended ? 'Resume' : 'Suspend'} ${lemma}`}
    onClick={() => startTransition(async () => {
      let ok = false;
      try { ({ ok } = await setWordSuspendedAction(entryId, !suspended)); }
      catch { /* surfaced below */ }
      if (ok) router.refresh();
      else notifyError(`Couldn't ${suspended ? 'resume' : 'suspend'} "${lemma}". Please try again.`, `suspend-${entryId}`);
    })}>{pending ? 'saving…' : suspended ? 'resume' : 'suspend'}</Pill>;
}
