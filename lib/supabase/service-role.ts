import { PostgrestClient } from '@supabase/postgrest-js';

/**
 * Service-role database client: bypasses RLS entirely.
 *
 * Only for server-side writes to the policy-free tables (`token_usage`,
 * `session_usage`) that no user session is allowed to touch. Never import this
 * into anything that reaches the browser -- the secret key grants full access
 * to every row in every table.
 *
 * Uses PostgrestClient directly rather than supabase-js's createClient for two
 * reasons:
 *
 *  1. supabase-js always constructs a Realtime client, which throws outright on
 *     Node < 22 ("Node.js 20 detected without native WebSocket support"). That
 *     made every logUsage() call fail silently under the eval runner, which
 *     runs as a plain tsx script rather than inside Next.
 *  2. This path only ever issues REST writes. Auth, Realtime, Storage and
 *     Functions are all dead weight here.
 *
 * Kept out of lib/supabase/server.ts deliberately: that module imports
 * `next/headers`, which only resolves inside a Next.js request context, and
 * the eval runner reaches this file through lib/tutor.ts.
 */
export function createServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return new PostgrestClient(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
}

/** True when the service-role environment is wired up at all. */
export function hasServiceRoleEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
