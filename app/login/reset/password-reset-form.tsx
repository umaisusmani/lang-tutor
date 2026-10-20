'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset, updatePassword, type AuthState } from '@/app/auth/actions';

export function PasswordResetForm({ updating, invalidLink }: { updating: boolean; invalidLink: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updating ? updatePassword : requestPasswordReset, null);
  const inputClass = 'border-line bg-panel rounded-xl border-2 px-4 py-3 text-base';
  return <>
    <h1 className="font-display text-4xl">{state?.success ? 'Password updated' : updating ? 'Choose a new password' : 'Reset your password'}</h1>
    {invalidLink && <p role="alert">That reset link is invalid or has expired. Request a new one below.</p>}
    {state?.success ? <Link href="/" className="font-semibold underline">Continue to chat →</Link> : (
      <form action={action} className="flex flex-col gap-3">
        {updating ? <>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" name="password" type="password" minLength={6} maxLength={128} autoComplete="new-password" required className={inputClass} />
          <label htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" name="confirmation" type="password" minLength={6} maxLength={128} autoComplete="new-password" required className={inputClass} />
        </> : <>
          <p className="text-ink-2">Enter your account’s email address. We’ll send you a link to choose a new password.</p>
          <label htmlFor="reset-email">Email address</label>
          <input id="reset-email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </>}
        {state?.error && <p role="alert">{state.error}</p>}
        {state?.notice && <p role="status">{state.notice}</p>}
        <button disabled={pending} type="submit" className="border-line bg-yellow text-on-bright rounded-xl border-2 px-4 py-3 font-semibold disabled:opacity-50">
          {pending ? 'Please wait…' : updating ? 'Save new password' : 'Send reset link'}
        </button>
      </form>
    )}
    <Link href="/login" className="text-sm underline">Back to sign in</Link>
    {updating && !state?.success && <Link href="/login/reset" className="text-sm underline">Request another reset link</Link>}
  </>;
}
