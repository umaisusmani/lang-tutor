import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Email confirmation link. The Supabase "Confirm signup" template points here
 * with a `token_hash`, which is verified directly -- unlike the PKCE `code`
 * flow in ../callback, it doesn't need the code-verifier cookie from the
 * browser that signed up, so the link works when it's opened on a phone or in
 * a different browser than the one the account was created in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${type === 'recovery' ? '/login/reset?mode=update' : '/'}`);
    }
    console.error('[auth/confirm] verifyOtp failed:', error.message);
  } else {
    console.error('[auth/confirm] missing token_hash or type');
  }

  return NextResponse.redirect(`${origin}${type === 'recovery' ? '/login/reset?error=recovery_failed' : '/login?error=confirm_failed'}`);
}
