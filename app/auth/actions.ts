'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { isCefrLevel } from '@/lib/prompts';
import {
  getCurrentUserId,
  updateCefrLevel,
  updateTimezone,
} from '@/lib/services/profile.service';
import { createClient } from '@/lib/supabase/server';

/**
 * `error` is a failure to show; `notice` is a neutral message; `pendingEmail`
 * is set when the account exists but its email isn't confirmed yet, which
 * switches the login page to the "enter the code" screen for that address.
 */
export type AuthState = { error?: string; notice?: string; pendingEmail?: string } | null;

/**
 * This request's own origin, for links that email or OAuth providers send the
 * user back to. Derived from Host, not the Origin header: Origin is only sent
 * on some request types and isn't guaranteed to survive a proxy layer like
 * Vercel's intact, which was silently falling back to the hardcoded localhost
 * URL in production. Host is a mandatory header on every HTTP/1.1+ request --
 * it's the same value Next.js's own Server Action CSRF check treats as ground
 * truth (see next.config.ts's allowedOrigins comment).
 */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

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

  if (error) {
    if (error.code === 'email_not_confirmed') {
      // Only reached with the right password, so it's safe to send a fresh
      // code here. A resend inside Supabase's cooldown fails; that's fine, the
      // earlier code is still good, so the code screen opens either way.
      await supabase.auth.resend({ type: 'signup', email });
      return {
        pendingEmail: email,
        notice: "Your email isn't confirmed yet. Enter the code we just sent you.",
      };
    }
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Only used if the email template still carries a link instead of (or as
    // well as) the code: app/auth/confirm/route.ts.
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm` },
  });

  if (error) return { error: error.message };

  // With "Confirm email" on in the Supabase project there is no session yet:
  // the account exists (the on_auth_user_created trigger already made the
  // profiles row) but can't sign in until the link is clicked. An address that
  // is already registered also lands here with no session and no error, which
  // keeps signup from revealing who has an account.
  if (!data.session) {
    return { pendingEmail: email };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * Checks the code from the confirmation email. On success the session is set
 * on this response, so it redirects straight in like a normal sign-in.
 */
export async function verifySignupCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const token = String(formData.get('code') ?? '').replace(/\s+/g, '');

  if (!/^\d{6,10}$/.test(token)) {
    return { pendingEmail: email, error: 'Enter the code from the email (digits only).' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });

  if (error) {
    return {
      pendingEmail: email,
      error: 'That code is wrong or has expired. Check it, or send a new one.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

/** Sends the signup confirmation email (and its code) again. */
export async function resendConfirmation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  if (!email) return { error: 'Enter your email first.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm` },
  });

  if (error) return { pendingEmail: email, error: error.message };
  return { pendingEmail: email, notice: `New code sent to ${email}. Check spam too.` };
}

/**
 * Kicks off Google OAuth. Unlike signIn/signUp, this doesn't set a session
 * itself -- it just asks Supabase for Google's consent-screen URL and
 * redirects there. The session gets set later, when Google sends the user
 * back to app/auth/callback/route.ts with a code to exchange.
 */
export async function signInWithGoogle() {
  const origin = await getOrigin();
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
export async function saveTimezone(timezone: string) {
  if (typeof timezone !== 'string' || timezone.length > 64) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  await updateTimezone(userId, timezone);
  // Today's due counts depend on it.
  revalidatePath('/', 'layout');
}

export async function saveLevel(level: string) {
  if (!isCefrLevel(level)) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  await updateCefrLevel(userId, level);
}
