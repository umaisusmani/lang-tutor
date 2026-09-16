import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components. Reads and writes the session
 * cookies through the browser's own document.cookie, so the session stays in
 * sync with the server-side clients in this same directory.
 *
 * Safe to call on every render -- createBrowserClient memoises internally, so
 * this does not open a new connection each time.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
