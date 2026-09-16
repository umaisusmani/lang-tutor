import { DEFAULT_CEFR_LEVEL, isCefrLevel, type CefrLevel } from '@/lib/prompts';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types/db';

/**
 * All reads and writes against `profiles`. Callers (route handlers, Server
 * Actions, Server Components) go through here rather than building their own
 * queries, so the table name and column names live in exactly one place.
 *
 * Every function uses the session-scoped client, which means RLS is doing the
 * ownership enforcement -- these functions physically cannot reach another
 * user's row, so they carry no ownership checks of their own.
 */

/** The signed-in user's id, or null when the request is anonymous. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The signed-in user, or null. Use when you need the email too, not just id. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('user_id, cefr_level, created_at')
    .eq('user_id', userId)
    .single();

  return (data as Profile) ?? null;
}

/**
 * Resolves the level to use for a request: the profile when signed in, the
 * supplied cookie value when anonymous, and the default when neither is
 * usable. The cookie is validated rather than trusted -- it's client-controlled
 * and ends up interpolated into a system prompt.
 */
export async function resolveCefrLevel(
  userId: string | null,
  cookieValue: string | undefined,
): Promise<CefrLevel> {
  if (userId) {
    const profile = await getProfile(userId);
    if (isCefrLevel(profile?.cefr_level)) return profile.cefr_level;
    return DEFAULT_CEFR_LEVEL;
  }

  return isCefrLevel(cookieValue) ? cookieValue : DEFAULT_CEFR_LEVEL;
}

export async function updateCefrLevel(userId: string, level: CefrLevel): Promise<void> {
  const supabase = await createClient();
  await supabase.from('profiles').update({ cefr_level: level }).eq('user_id', userId);
}
