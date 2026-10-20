'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import type { QuotaStatus } from '@/lib/quota';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function QuotaBanner({ quota, signedIn, onRetry }: {
  quota: QuotaStatus;
  signedIn: boolean;
  onRetry: () => void;
}) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const resetLabel = hydrated
    ? new Date(quota.resetsAt).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
    : new Date(quota.resetsAt).toUTCString();
  if (!quota.reason) return null;
  const unavailable = quota.reason === 'unavailable';
  return (
    <div role="status" className="border-line bg-yellow text-on-bright flex flex-col gap-1.5 rounded-xl border-2 px-4 py-3">
      <p className="font-semibold">
        {unavailable ? 'Could not check your message allowance' : quota.reason === 'global'
          ? 'The tutor has reached today’s shared limit' : 'You’ve reached your daily limit'}
      </p>
      <p className="text-sm">
        {unavailable ? 'Please check again in a moment.' : `Messages reset on ${resetLabel}.`}
      </p>
      {unavailable && <button type="button" onClick={onRetry} className="self-start text-sm font-bold underline">Check again</button>}
      {quota.reason === 'user' && !signedIn && <Link href="/login" className="self-start text-sm font-bold underline">Sign in for 35 messages a day →</Link>}
    </div>
  );
}
