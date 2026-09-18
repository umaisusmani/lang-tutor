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

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-baseline gap-2">
          <Link href="/" className="text-sm font-semibold">
            Lang Tutor
          </Link>
          <span className="text-xs text-zinc-500">Deutsch üben</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-lg font-semibold">
          {mode === 'signin' ? 'Willkommen zurück' : 'Konto erstellen'}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {mode === 'signin'
            ? 'Melde dich an, um deine Vokabeln zu speichern.'
            : 'Registriere dich, um deinen Fortschritt zu speichern.'}
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            E-Mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Passwort
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          {state?.error && (
            <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? '…' : mode === 'signin' ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>

        {oauthFailed && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            Google-Anmeldung fehlgeschlagen. Bitte versuch es noch einmal.
          </p>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          oder
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
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

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="mt-4 text-xs text-zinc-500 underline underline-offset-4"
        >
          {mode === 'signin'
            ? 'Noch kein Konto? Registrieren'
            : 'Schon ein Konto? Anmelden'}
        </button>

        <Link href="/" className="mt-6 text-xs text-zinc-500 underline underline-offset-4">
          Ohne Konto weiterchatten
        </Link>
      </main>
    </div>
  );
}
