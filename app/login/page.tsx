'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { signIn, signUp, type AuthState } from '@/app/auth/actions';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);

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
