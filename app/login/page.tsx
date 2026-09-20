'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState, useState } from 'react';

import { signIn, signInWithGoogle, signUp, type AuthState } from '@/app/auth/actions';

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

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);

  // Set by app/auth/callback/route.ts when Google's code exchange fails, or
  // by signInWithGoogle() if Supabase never returned a redirect URL at all.
  const errorParam = useSearchParams().get('error');
  const oauthFailed = errorParam === 'auth_callback_failed' || errorParam === 'oauth_failed';

  const fieldLabel = 'text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase';
  const fieldInput =
    'border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] rounded-xl border-2 px-4 py-3 text-base outline-none';

  return (
    <div className="bg-paper text-ink flex min-h-dvh justify-center px-[18px] pb-6">
      <div className="flex min-h-dvh w-full max-w-[860px] flex-col">
        <header className="flex flex-wrap items-center gap-3 pt-5 pb-3">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div className="border-line bg-yellow text-on-bright flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-2 text-base font-extrabold">
              s
            </div>
            <div className="flex flex-col">
              <span className="text-ink text-[19px] leading-[1.1] font-extrabold tracking-[-0.02em]">
                starprache
              </span>
              <span className="text-ink-3 font-mono text-[10px]">german conversation practice</span>
            </div>
          </Link>
        </header>

        <main className="flex max-w-[420px] flex-1 flex-col justify-center gap-[22px] py-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.025em]">
              {mode === 'signin' ? 'Willkommen zurück.' : 'Konto erstellen.'}
            </h1>
            <p className="text-ink-2 text-[15px] leading-relaxed">
              {mode === 'signin'
                ? 'Sign in to keep your vocab list and conversation history.'
                : 'Create an account to save your progress and chat without limits.'}
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
              placeholder="du@beispiel.de"
              className={fieldInput}
            />

            <label className={`${fieldLabel} mt-1.5`} htmlFor="password">
              password
            </label>
            <input
              id="password"
              name="password"
              type="password"
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

            <button
              type="submit"
              disabled={pending}
              className="border-line bg-yellow text-on-bright mt-1.5 cursor-pointer rounded-xl border-2 px-4 py-3 text-base font-bold shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50"
            >
              {pending ? '…' : mode === 'signin' ? 'Anmelden' : 'Registrieren'}
            </button>
          </form>

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
              Mit Google anmelden
            </button>
          </form>

          <div className="text-ink-3 flex flex-col gap-1.5 font-mono text-[11px] leading-[1.7]">
            <button
              type="button"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="hover:text-ink cursor-pointer text-left underline underline-offset-[3px]"
            >
              {mode === 'signin' ? 'No account yet? Register' : 'Already have an account? Sign in'}
            </button>
            <Link href="/" className="text-ink-3 hover:text-ink no-underline">
              <span className="underline underline-offset-[3px]">Keep chatting without an account</span>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
