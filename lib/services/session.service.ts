import { cookies } from 'next/headers';

import { createServiceRoleClient } from '@/lib/supabase/service-role';

const SESSION_COOKIE = 'session_id';

/** Anonymous visitors get this many messages before being asked to sign in. */
export const ANON_MESSAGE_CAP = 5;

/**
 * Returns the visitor's session id, creating one if this is their first
 * request. `httpOnly` so client-side JS can never read or forge it -- the
 * cookie only round-trips between browser and server, which is what makes
 * this an actual rate limit rather than a UI suggestion (a counter kept in
 * localStorage or component state resets the moment someone opens DevTools,
 * uses incognito, or just calls /api/chat directly with curl).
 */
export async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return sessionId;
}

/**
 * Checks the session's message count against the cap and, if under it,
 * increments it. Only ever called for anonymous requests -- signed-in users
 * skip this entirely (see app/api/chat/route.ts).
 *
 * Uses the service-role client because `session_usage` has RLS enabled with
 * zero policies: no user session (anon or authenticated) can read or write it
 * directly, specifically so a client can't just overwrite its own counter.
 *
 * Read-then-write, not a single atomic increment: a genuine race (two
 * concurrent requests from the exact same anonymous session) would let it
 * overshoot the cap by one. Accepted tradeoff for this project's scale --
 * one person typing in one chat tab, not concurrent bot traffic -- rather
 * than adding a Postgres function just to close a one-message race window.
 */
export async function checkAndIncrementUsage(
  sessionId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createServiceRoleClient();

  const { data: existing } = await supabase
    .from('session_usage')
    .select('message_count')
    .eq('session_id', sessionId)
    .single();

  const currentCount = existing?.message_count ?? 0;

  if (currentCount >= ANON_MESSAGE_CAP) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = currentCount + 1;
  await supabase
    .from('session_usage')
    .upsert({ session_id: sessionId, message_count: newCount }, { onConflict: 'session_id' });

  return { allowed: true, remaining: ANON_MESSAGE_CAP - newCount };
}
