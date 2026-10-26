'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState, useEffect, useRef, useState } from 'react';

import {
  resendConfirmation,
  signIn,
  signInWithGoogle,
  signUp,
  verifySignupCode,
  type AuthState,
} from '@/app/auth/actions';
import { Brand } from '@/app/components/brand';
import { PasswordInput } from '@/app/components/password-input';
import { PersonaAvatar } from '@/app/components/persona-avatar';
import { FALLBACK_PERSONA } from '@/lib/personas';

/** Seconds the server enforces between confirmation emails; purely cosmetic
 * (the resend button still just hits the server action), so a wrong guess
 * only costs an early-enabled button rather than a broken request. */
const RESEND_COOLDOWN_SECONDS = 60;

// useSearchParams() (used below, for surfacing a failed Google redirect)
// requires a Suspense boundary in the App Router -- without one, this page
// can't be statically rendered at all. The default export just provides that
// boundary; LoginForm has the actual page.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function GuestChatLink() {
  return (
    <Link
      href="/"
      className="border-line text-ink hover:bg-yellow hover:text-on-bright ml-auto flex min-h-11 items-center rounded-full border-2 px-3 py-1.5 font-mono text-xs font-bold no-underline transition-colors"
    >
      Chat as guest
    </Link>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>(
    () => (searchParams.get('mode') === 'signup' ? 'signup' : 'signin'),
  );
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);
  // The address whose code screen the learner backed out of ("use a different
  // email"), so the same pending state doesn't bring the screen straight back.
  const [dismissedEmail, setDismissedEmail] = useState<string | null>(null);

  // Set by app/auth/callback/route.ts when Google's code exchange fails, or
  // by signInWithGoogle() if Supabase never returned a redirect URL at all.
  const errorParam = searchParams.get('error');
  const oauthFailed = errorParam === 'auth_callback_failed' || errorParam === 'oauth_failed';
  const confirmFailed = errorParam === 'confirm_failed';

  const fieldLabel = 'text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase';
  const fieldInput =
    'border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] rounded-xl border-2 px-4 py-3 text-base outline-none w-full';

  if (state?.pendingEmail && state.pendingEmail !== dismissedEmail) {
    return (
      <ConfirmCodeScreen
        email={state.pendingEmail}
        notice={state.notice}
        error={state.error}
        onBack={() => setDismissedEmail(state.pendingEmail ?? null)}
      />
    );
  }

  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <header className="flex w-full max-w-[1080px] flex-wrap items-center gap-3 pt-5 pb-3">
        <Brand />
        <GuestChatLink />
      </header>
      <div className="flex w-full max-w-[860px] flex-1 flex-col">

        <main className="mx-auto flex max-w-[420px] flex-1 flex-col justify-center gap-[22px] py-12">
          <div className="flex flex-col items-center gap-2 text-center">
            <PersonaAvatar persona={FALLBACK_PERSONA} size={48} />
            <h1 className="font-display text-[44px] leading-none font-black tracking-[0.02em]">
              {mode === 'signin' ? (
                <>Welcome <span className="text-accent">back</span>.</>
              ) : (
                <>Let&apos;s <span className="text-accent">go</span>.</>
              )}
            </h1>
            <p className="text-ink-2 font-mono text-[12.5px] leading-relaxed">
              {mode === 'signin'
                ? `${FALLBACK_PERSONA.name} saved your seat — keep your vocab list and conversation history.`
                : 'Free account: saved progress, saved words, and 35 messages a day.'}
            </p>
          </div>

          <form action={formAction} className="flex flex-col gap-2.5">
            <label className={fieldLabel} htmlFor="email">
              email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={fieldInput}
            />

            <label className={`${fieldLabel} mt-1.5`} htmlFor="password">
              password
            </label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={fieldInput}
            />

            {state?.error && (
              <p className="font-mono text-[11px] leading-[1.7] text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}
            {state?.notice && (
              <p className="text-ink-2 font-mono text-[11px] leading-[1.7]">{state.notice}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="border-line bg-yellow text-on-bright font-display mt-1.5 cursor-pointer rounded-xl border-2 px-4 py-3 text-xl tracking-[0.04em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50"
            >
              {pending ? '…' : mode === 'signin' ? 'Sign in' : 'Register'}
            </button>
          </form>

          {confirmFailed && (
            <p className="font-mono text-[11px] leading-[1.7] text-red-600 dark:text-red-400">
              That confirmation link didn&apos;t work. Sign in and we&apos;ll send a code instead.
            </p>
          )}

          {oauthFailed && (
            <p className="font-mono text-[11px] leading-[1.7] text-red-600 dark:text-red-400">
              Google sign-in failed. Please try again.
            </p>
          )}

          <div className="text-ink-3 flex items-center gap-3 font-mono text-[10px] tracking-[0.08em] uppercase">
            <div className="bg-hair h-px flex-1" />
            or
            <div className="bg-hair h-px flex-1" />
          </div>

          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="border-line bg-panel text-ink hover:shadow-[3px_3px_0_var(--line)] flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 px-4 py-3 text-base font-bold transition-transform hover:-translate-x-px hover:-translate-y-px"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.27-2.09 3.56-5.17 3.56-8.84z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.11C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.29 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.6H1.28A11.96 11.96 0 000 12c0 1.93.46 3.76 1.28 5.4l4.01-3.11z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.6l4.01 3.11c.94-2.83 3.59-4.94 6.71-4.94z"
                />
              </svg>
              Sign in with Google
            </button>
          </form>

          <div className="text-ink-3 flex flex-col gap-1.5 font-mono text-[11px] leading-[1.7]">
            {mode === 'signin' && <Link href="/login/reset" className="flex min-h-11 items-center py-1 text-sm underline">Forgot your password?</Link>}
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="hover:text-ink min-h-11 cursor-pointer text-left underline underline-offset-[3px]"
            >
              {mode === 'signin' ? 'No account yet? Register' : 'Already have an account? Sign in'}
            </button>
            <Link href="/" className="text-ink-3 hover:text-ink flex min-h-11 items-center no-underline">
              <span className="underline underline-offset-[3px]">Keep chatting without an account</span>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The 8-digit code as a row of boxes, purely decorative: the real input sits
 * transparently on top of it (see ConfirmCodeScreen) and carries the value,
 * focus and typing -- this just mirrors what's been typed so far. */
function OtpBoxes({ value, length = 8 }: { value: string; length?: number }) {
  const half = length / 2;
  const box = (i: number) => (
    <span
      key={i}
      className={`border-line bg-panel flex h-11 w-8 flex-none items-center justify-center rounded-lg border-2 font-mono text-xl ${
        i === value.length ? 'shadow-[2px_2px_0_var(--line)]' : ''
      }`}
    >
      {value[i] ?? ''}
    </span>
  );
  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-1.5">
      {Array.from({ length: half }, (_, i) => box(i))}
      <span className="bg-hair mx-1 h-6 w-px flex-none" />
      {Array.from({ length: half }, (_, i) => box(half + i))}
    </div>
  );
}

/** A bordered callout for a single important line, matching the design's
 * "call" box -- used here for the code-screen context and its errors. */
function Callout({ tone = 'default', label, children }: {
  tone?: 'default' | 'error';
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`flex animate-[fade-rise_160ms_ease-out] flex-col gap-1 rounded-xl border-2 px-4 py-3 ${
        tone === 'error' ? 'border-red-600/60 bg-red-600/5 dark:border-red-400/50' : 'border-hair bg-panel'
      }`}
    >
      <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">{label}</span>
      <span className="text-ink text-sm leading-relaxed">{children}</span>
    </div>
  );
}

/**
 * Second step of registering: the confirmation email carries a numeric code,
 * entered here instead of following a link, so it works from any device and
 * isn't spent by an email scanner opening the link first.
 */
function ConfirmCodeScreen({
  email,
  notice,
  error,
  onBack,
}: {
  email: string;
  notice?: string;
  error?: string;
  onBack: () => void;
}) {
  const [verifyState, verifyAction, verifying] = useActionState<AuthState, FormData>(
    verifySignupCode,
    null,
  );
  const [resendState, resendAction, resending] = useActionState<AuthState, FormData>(
    resendConfirmation,
    null,
  );
  const [code, setCode] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // A code was already sent before this screen ever shows (signIn/signUp send
  // one), so the cooldown starts right away (the lazy useState initializer),
  // then restarts on every resend click -- optimistically, the moment the
  // (enabled) button is clicked, rather than waiting on the action's result,
  // since the button is only clickable once the previous cooldown has
  // already cleared anyway.
  const [cooldownUntil, setCooldownUntil] = useState(() => Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const shownError = verifyState?.error ?? resendState?.error ?? error;
  const shownNotice = resendState?.notice ?? verifyState?.notice ?? notice;

  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <header className="flex w-full max-w-[1080px] flex-wrap items-center gap-3 pt-5 pb-3">
        <Brand />
        <GuestChatLink />
      </header>
      <div className="flex w-full max-w-[860px] flex-1 flex-col">
        <main className="mx-auto flex max-w-[420px] flex-1 flex-col justify-center gap-[22px] py-12">
          <div className="flex flex-col items-center gap-2 text-center">
            <PersonaAvatar persona={FALLBACK_PERSONA} size={48} />
            <h1 className="font-display text-[44px] leading-none font-black tracking-[0.02em]">
              Check your <span className="text-accent">inbox</span>.
            </h1>
          </div>

          <Callout label="Confirm your account">
            We sent a code to <span className="text-ink font-semibold">{email}</span>. Enter it
            below to finish creating your account.
          </Callout>

          <form ref={formRef} action={verifyAction} className="flex flex-col gap-2.5">
            <input type="hidden" name="email" value={email} />
            <label
              className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase"
              htmlFor="code"
            >
              confirmation code
            </label>
            <div className="relative">
              <OtpBoxes value={code} />
              <input
                id="code"
                name="code"
                value={code}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
                  setCode(digits);
                  if (digits.length === 8) formRef.current?.requestSubmit();
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                required
                autoFocus
                aria-label="Confirmation code"
                className="absolute inset-0 h-full w-full cursor-text text-transparent caret-transparent opacity-0"
              />
            </div>
            <p className="text-ink-3 text-center font-mono text-[10px]">
              Paste works. It sends by itself once the last digit is in.
            </p>

            {shownError && <Callout tone="error" label="That didn’t work">{shownError}</Callout>}
            {shownNotice && !shownError && (
              <p className="text-ink-2 font-mono text-[11px] leading-[1.7]">{shownNotice}</p>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="border-line bg-yellow text-on-bright font-display mt-1.5 cursor-pointer rounded-xl border-2 px-4 py-3 text-xl tracking-[0.04em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50"
            >
              {verifying ? '…' : 'Confirm'}
            </button>
          </form>

          <div className="text-ink-3 flex flex-col gap-1.5 font-mono text-[11px] leading-[1.7]">
            <form action={resendAction}>
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                onClick={() => setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000)}
                disabled={resending || secondsLeft > 0}
                className="hover:text-ink min-h-11 cursor-pointer text-left underline underline-offset-[3px] disabled:cursor-default disabled:opacity-50 disabled:no-underline"
              >
                {resending
                  ? 'Sending…'
                  : secondsLeft > 0
                    ? `Send a new code in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                    : 'Send a new code'}
              </button>
            </form>
            <button
              type="button"
              onClick={onBack}
              className="hover:text-ink min-h-11 cursor-pointer text-left underline underline-offset-[3px]"
            >
              Use a different email
            </button>
            <p className="text-ink-3">
              Nothing in your inbox? If you already registered with this address, no new code is
              sent. Use a different email, then choose &ldquo;Already have an account? Sign in&rdquo;.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
