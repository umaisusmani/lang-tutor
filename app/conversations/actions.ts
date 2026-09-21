'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUserId } from '@/lib/services/profile.service';
import { deleteConversation } from '@/lib/services/conversation.service';

/**
 * Deletes one of the signed-in user's conversations.
 *
 * A Server Action rather than a route handler, matching every other mutation
 * in the app (vocab, level, auth): Next.js gives it the CSRF origin check and
 * lets the client call it like a function. It's still a public POST endpoint
 * underneath, so it re-derives the user from the session instead of trusting
 * anything the client says about who is asking -- the client supplies only
 * *which* conversation.
 *
 * Returns `{ ok }` instead of nothing, and instead of throwing: the caller
 * navigates away when the open conversation is the one deleted, and must only
 * do that once the delete has actually happened.
 *
 * Both routes that render the conversation list are revalidated. Calling
 * revalidatePath inside an action also re-renders the current route in the
 * same response, so the header menu updates without a follow-up fetch.
 */
export async function deleteConversationAction(id: string): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const ok = await deleteConversation(userId, id);
  if (ok) {
    revalidatePath('/');
    revalidatePath('/vocab');
  }
  return { ok };
}
