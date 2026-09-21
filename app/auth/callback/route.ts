import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * OAuth callback. Google (step 5) redirects here with a `code` that has to be
 * exchanged for a session before the user is actually signed in. Email/password
 * never reaches this route -- it gets its session directly from the Server
 * Action instead.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Was silently discarded before -- a failed exchange redirected to a
    // generic error page with zero information about why. This is the one
    // place that would show a PKCE code-verifier mismatch (e.g. the cookie
    // from initiating the flow not being readable at this domain/request).
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
  } else {
    console.error('[auth/callback] no code param on callback request');
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
