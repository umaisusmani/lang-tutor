import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session on every request and forwards the rotated
 * auth cookies to both the browser and the downstream render. Called from
 * proxy.ts (Next.js 16's rename of the middleware convention).
 *
 * This exists because access tokens are short-lived. Without a refresh on each
 * request, a session silently expires mid-use and the user appears randomly
 * logged out. The cookie juggling below is fiddly but load-bearing: cookies
 * have to be written to BOTH `request` (so Server Components rendering this
 * same request see the fresh session) and `response` (so the browser stores
 * it for next time).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() -- not getSession() -- because it revalidates the token against
  // Supabase's auth server rather than trusting whatever the cookie claims.
  // This call is also what triggers the refresh, so it must not be removed
  // even though its return value is unused here.
  await supabase.auth.getUser();

  return response;
}
