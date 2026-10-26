'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset, updatePassword, type AuthState } from '@/app/auth/actions';
import { PasswordInput } from '@/app/components/password-input';

export function PasswordResetForm({ updating, invalidLink }: { updating: boolean; invalidLink: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updating ? updatePassword : requestPasswordReset, null);
  const inputClass = 'border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] rounded-xl border-2 px-4 py-3 text-base outline-none w-full';
  const fieldLabel = 'text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase';
  return (
    <div className="border-line bg-panel flex flex-col gap-3 rounded-xl border-2 p-5">
      <h1 className="font-display text-[32px] leading-none tracking-[0.02em]">
        {state?.success ? 'Password updated' : updating ? 'Choose a new password' : 'Reset your password'}
      </h1>
      {invalidLink && (
        <p role="alert" className="font-mono text-[11px] leading-[1.7] text-red-600 dark:text-red-400">
          That reset link is invalid or has expired. Request a new one below.
        </p>
      )}
      {state?.success ? (
        <Link
          href="/"
          className="border-line bg-yellow text-on-bright font-display w-fit rounded-xl border-2 px-4 py-3 text-xl tracking-[0.04em] no-underline shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)]"
        >
          Continue to chat →
        </Link>
      ) : (
        <form action={action} className="flex flex-col gap-2.5">
          {updating ? (
            <>
              <label className={fieldLabel} htmlFor="new-password">New password</label>
              <PasswordInput id="new-password" name="password" minLength={6} maxLength={128} autoComplete="new-password" required className={inputClass} />
              <label className={`${fieldLabel} mt-1.5`} htmlFor="confirm-password">Confirm password</label>
              <PasswordInput id="confirm-password" name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" required className={inputClass} />
            </>
          ) : (
            <>
              <p className="text-ink-2 text-[15px] leading-relaxed">
                Enter your account’s email address. We’ll send you a link to choose a new password.
              </p>
              <label className={fieldLabel} htmlFor="reset-email">email</label>
              <input id="reset-email" name="email" type="email" autoComplete="email" required className={inputClass} />
            </>
          )}
          {state?.error && (
            <p role="alert" className="font-mono text-[11px] leading-[1.7] text-red-600 dark:text-red-400">{state.error}</p>
          )}
          {state?.notice && (
            <p role="status" className="text-ink-2 font-mono text-[11px] leading-[1.7]">{state.notice}</p>
          )}
          <button
            disabled={pending}
            type="submit"
            className="border-line bg-yellow text-on-bright font-display mt-1.5 cursor-pointer rounded-xl border-2 px-4 py-3 text-xl tracking-[0.04em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50"
          >
            {pending ? 'Please wait…' : updating ? 'Save new password' : 'Send reset link'}
          </button>
        </form>
      )}
      <div className="text-ink-3 flex flex-col gap-1.5 font-mono text-[11px] leading-[1.7]">
        <Link href="/login" className="hover:text-ink underline underline-offset-[3px]">Back to sign in</Link>
        {updating && !state?.success && (
          <Link href="/login/reset" className="hover:text-ink underline underline-offset-[3px]">Request another reset link</Link>
        )}
      </div>
    </div>
  );
}
