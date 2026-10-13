import { cookies } from 'next/headers';

import { createServiceRoleClient } from '@/lib/supabase/service-role';

const SESSION_COOKIE = 'session_id';

/** Anonymous visitors get this many messages per day before being asked to sign in. */
export const ANON_DAILY_CAP = 5;

/** Signed-in users: messages per day. Grammar explanations count too. */
export const USER_DAILY_CAP = 35;

/**
 * Messages the whole app will serve per day, the backstop for the monthly
 * model budget. Tune it with GLOBAL_DAILY_MESSAGE_CAP rather than a deploy.
 */
export const GLOBAL_DAILY_CAP = Number(process.env.GLOBAL_DAILY_MESSAGE_CAP) || 300;

export type LimitReason = 'user' | 'global';

export type UsageResult =
  | { allowed: true; remaining: number; cap: number }
  | { allowed: false; reason: LimitReason; remaining: 0; cap: number };

/**
 * Returns the visitor's session id, creating one if this is their first
 * request. `httpOnly` so client-side JS can never read or forge it -- the
 * cookie only round-trips between browser and server, which is what makes
 * this an actual rate limit rather than a UI suggestion (a counter kept in
 * localStorage or component state resets the moment someone opens DevTools,
 * uses incognito, or just calls /api/chat directly with curl).
 *
 * Route handlers only: it writes a cookie, which a Server Component can't.
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

export function dailyCapFor(userId: string | null): number {
  return userId ? USER_DAILY_CAP : ANON_DAILY_CAP;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * How many messages this caller has left today, without touching anything.
 *
 * Read-only on purpose, and deliberately NOT built on getSessionId(): that one
 * writes a cookie, which a Server Component isn't allowed to do. No cookie
 * yet means nobody has sent a message from this browser, so the full cap is
 * still available. Does not look at the global counter -- that one only shows
 * up as the "resting" notice when someone actually sends.
 */
export async function getRemainingMessages(userId: string | null): Promise<number> {
  const cap = dailyCapFor(userId);

  let key: string;
  if (userId) {
    key = `user:${userId}`;
  } else {
    const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!sessionId) return cap;
    key = `anon:${sessionId}`;
  }

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('daily_usage')
    .select('message_count')
    .eq('key', key)
    .eq('day', utcDay())
    .maybeSingle();

  return Math.max(0, cap - (data?.message_count ?? 0));
}

/**
 * Takes one message out of today's allowance -- the caller's own and the
 * global one -- or says why it can't. Called for every model-spending request
 * (chat, grammar explanations), signed in or not, before any model call.
 *
 * Uses the service-role client because `daily_usage` has RLS enabled with zero
 * policies: no user session can read or write it directly, so a client can't
 * overwrite its own counter. The increment itself is the atomic Postgres
 * function consume_message (0007), not a read-then-write.
 *
 * Fails closed: if the counter can't be reached, the request is refused
 * rather than waved through, because this is the guard on the budget.
 */
export async function consumeMessage(userId: string | null): Promise<UsageResult> {
  const cap = dailyCapFor(userId);
  const key = userId ? `user:${userId}` : `anon:${await getSessionId()}`;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('consume_message', {
    p_key: key,
    p_cap: cap,
    p_global_cap: GLOBAL_DAILY_CAP,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error('[session.service] consume_message failed:', error?.message);
    return { allowed: false, reason: 'global', remaining: 0, cap };
  }

  if (!row.allowed) {
    return { allowed: false, reason: row.reason === 'user' ? 'user' : 'global', remaining: 0, cap };
  }
  return { allowed: true, remaining: row.remaining, cap };
}
