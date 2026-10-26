'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { PersonaAvatar } from '@/app/components/persona-avatar';
import type { PersonaProfile } from '@/lib/personas';
import type { QuotaStatus } from '@/lib/quota';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** At or below this many messages left, a non-blocking heads-up shows above the composer. */
export const WARNING_AT = 5;

export function useResetLabel(resetsAt?: string) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!resetsAt) return '';
  return hydrated
    ? new Date(resetsAt).toLocaleString([], {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
    : new Date(resetsAt).toUTCString();
}

export function QuotaBanner({
  quota,
  signedIn,
  onRetry,
  persona,
  dueCount = 0,
  onOpenTranslate,
  compact = false,
}: {
  quota: QuotaStatus;
  signedIn: boolean;
  onRetry: () => void;
  /** Shown on the full takeover card once the daily cap is hit; omitted in the side panel. */
  persona?: PersonaProfile;
  /** Cards waiting in the review queue, for the takeover card's CTA. */
  dueCount?: number;
  /** Lets the takeover card send the learner straight to the Translate tab. */
  onOpenTranslate?: () => void;
  /** The side panel's tighter space: always a one-line banner, never the takeover card. */
  compact?: boolean;
}) {
  const resetLabel = useResetLabel(quota.resetsAt);
  const cappedByUser = quota.reason === 'user' || (quota.reason === null && quota.remaining <= 0);

  if (cappedByUser) {
    if (!compact) {
      return signedIn
        ? (
          <OutOfMessagesCard
            persona={persona}
            dueCount={dueCount}
            resetLabel={resetLabel}
            onOpenTranslate={onOpenTranslate}
          />
        )
        : <OutOfMessagesGuestCard />;
    }
    return (
      <div role="status" className="border-line bg-yellow text-on-bright flex flex-col gap-1.5 rounded-xl border-2 px-4 py-3">
        <p className="font-semibold">You’ve reached your daily limit</p>
        <p className="text-sm">Messages reset on {resetLabel}.</p>
        {!signedIn && (
          <Link href="/login" className="self-start text-sm font-bold underline">
            Sign in for 35 messages a day →
          </Link>
        )}
      </div>
    );
  }

  if (quota.reason === 'global' || quota.reason === 'unavailable') {
    const unavailable = quota.reason === 'unavailable';
    return (
      <div role="status" className="border-line bg-yellow text-on-bright flex flex-col gap-1.5 rounded-xl border-2 px-4 py-3">
        <p className="font-semibold">
          {unavailable ? 'Could not check your message allowance' : 'The tutor has reached today’s shared limit'}
        </p>
        <p className="text-sm">
          {unavailable ? 'Please check again in a moment.' : `Messages reset on ${resetLabel}.`}
        </p>
        {unavailable && (
          <button type="button" onClick={onRetry} className="self-start text-sm font-bold underline">
            Check again
          </button>
        )}
      </div>
    );
  }

  // Not capped yet: a quiet, graduated heads-up as the allowance runs low.
  if (quota.remaining === 1) {
    return (
      <div role="status" className="border-line bg-yellow text-on-bright rounded-xl border-2 px-4 py-3">
        <p className="font-semibold">Last message for today.</p>
        <p className="text-sm">Make it a good one — words, flashcards and Translate keep working after.</p>
      </div>
    );
  }
  if (quota.remaining <= WARNING_AT) {
    return (
      <div role="status" className="border-hair bg-panel text-ink rounded-xl border-2 px-4 py-3 text-sm">
        <span className="font-semibold">{quota.remaining} messages left today.</span> Words, flashcards
        and Translate keep working.
      </div>
    );
  }
  return null;
}

/** Replaces the composer once the daily cap is hit for a signed-in learner. */
function OutOfMessagesCard({
  persona,
  dueCount,
  resetLabel,
  onOpenTranslate,
}: {
  persona?: PersonaProfile;
  dueCount: number;
  resetLabel: string;
  onOpenTranslate?: () => void;
}) {
  return (
    <div className="border-line bg-panel text-ink flex animate-[fade-rise_160ms_ease-out] flex-col gap-3 rounded-xl border-2 p-5">
      {persona && (
        <div className="flex items-center gap-2.5">
          <PersonaAvatar persona={persona} size={32} />
          <span className="text-ink-2 text-sm font-semibold">{persona.name}</span>
        </div>
      )}
      <h2 className="font-display text-[32px] leading-none tracking-[0.02em]">That&apos;s it for today.</h2>
      <p className="text-ink-2 text-sm leading-relaxed">
        Your messages come back on {resetLabel}.
      </p>
      <p className="text-ink-3 font-mono text-[11px]">
        Meanwhile: {dueCount > 0 ? `your ${dueCount} due card${dueCount === 1 ? '' : 's'}, ` : ''}saved words and
        Translate don&apos;t use the allowance.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/vocab"
          className="border-line bg-yellow text-on-bright font-display rounded-xl border-2 px-4 py-2 text-base tracking-[0.02em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)]"
        >
          {dueCount > 0 ? `Practice ${dueCount} due` : 'Open vocabulary'}
        </Link>
        {onOpenTranslate && (
          <button
            type="button"
            onClick={onOpenTranslate}
            className="border-line bg-panel text-ink hover:shadow-[3px_3px_0_var(--line)] cursor-pointer rounded-xl border-2 px-4 py-2 text-base font-bold transition-transform hover:-translate-x-px hover:-translate-y-px"
          >
            Translate
          </button>
        )}
      </div>
    </div>
  );
}

/** The signed-out equivalent: same shape, points at sign-up instead of the tools. */
function OutOfMessagesGuestCard() {
  return (
    <div className="border-line bg-panel text-ink flex animate-[fade-rise_160ms_ease-out] flex-col gap-3 rounded-xl border-2 p-5">
      <h2 className="font-display text-[28px] leading-none tracking-[0.02em]">That&apos;s it for today.</h2>
      <p className="text-ink-2 text-sm leading-relaxed">
        You&apos;ve used today&apos;s guest messages. Sign up free for a bigger daily allowance, saved chats
        and flashcards.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/login?mode=signup"
          className="border-line bg-yellow text-on-bright font-display rounded-xl border-2 px-4 py-2 text-base tracking-[0.02em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)]"
        >
          Register
        </Link>
        <Link
          href="/login"
          className="border-line bg-panel text-ink hover:shadow-[3px_3px_0_var(--line)] rounded-xl border-2 px-4 py-2 text-base font-bold transition-transform hover:-translate-x-px hover:-translate-y-px"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
