'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { isCefrLevel } from '@/lib/prompts';
import { getCurrentUserId, updateCefrLevel } from '@/lib/services/profile.service';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error: string } | null;

/**
 * Sign-in and sign-up run as Server Actions rather than API routes. The
 * browser SDK could call Supabase directly, but going through the server means
 * the session cookies are set server-side on the same response that redirects
 * -- no flash of signed-out UI while the client catches up.
 */
export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // Depending on the project's email-confirmation setting, the user may or may
  // not already have a live session here. Either way the profiles row exists
  // by now -- the on_auth_user_created trigger fires on insert into auth.users.
  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * Kicks off Google OAuth. Unlike signIn/signUp, this doesn't set a session
 * itself -- it just asks Supabase for Google's consent-screen URL and
 * redirects there. The session gets set later, when Google sends the user
 * back to app/auth/callback/route.ts with a code to exchange.
 *
 * `origin` comes from the request's own Origin header rather than an env var,
 * so this works unchanged on localhost and every Vercel preview/production
 * URL without per-environment config.
 */
export async function signInWithGoogle() {
  const origin = (await headers()).get('origin') ?? 'http://localhost:3000';
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth_failed');
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * Persists a signed-in user's CEFR level. Anonymous visitors never reach the
 * write -- they keep using the cookie, which the client writes directly and
 * the chat route reads as a fallback.
 */
export async function saveLevel(level: string) {
  if (!isCefrLevel(level)) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  await updateCefrLevel(userId, level);
}
