import { cookies } from 'next/headers';

import Chat from '@/app/chat';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';

/**
 * Server component wrapper: resolves who the visitor is and what level they're
 * set to before the chat UI renders. Doing this here rather than in the client
 * avoids the flash of default-level UI the old cookie-on-mount approach had.
 */
export default async function Page() {
  const user = await getCurrentUser();
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user?.id ?? null, levelCookie);

  return <Chat initialLevel={level} userEmail={user?.email ?? null} />;
}
