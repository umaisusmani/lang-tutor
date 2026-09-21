import type { WordGloss } from '@/lib/gloss';
import { createClient } from '@/lib/supabase/server';
import type { Correction } from '@/lib/tutor';
import type { Conversation, Message, MessageRole } from '@/lib/types/db';

/**
 * All reads and writes against `conversations` and `messages`.
 *
 * Uses the session-scoped client throughout, so RLS is what enforces
 * ownership -- including for `messages`, whose policies prove ownership by
 * joining to the parent conversation rather than carrying a user_id of their
 * own. That join is also what makes a forged conversation id harmless: an
 * insert naming someone else's conversation is rejected by the policy, so the
 * route doesn't need its own ownership check.
 */

/** A conversation's first ~60 characters, for the switcher list. */
function deriveTitle(firstMessage: string): string {
  const flat = firstMessage.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data as Conversation[]) ?? [];
}

export async function getLatestConversation(userId: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Conversation) ?? null;
}

/**
 * One conversation by id, or null if it doesn't exist OR isn't this user's --
 * RLS collapses those two cases into the same empty result, which is the
 * behaviour we want: a guessed id is indistinguishable from a missing one.
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return (data as Conversation) ?? null;
}

export async function createConversation(
  userId: string,
  title: string,
): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title: deriveTitle(title) })
    .select()
    .single();

  if (error) {
    console.error('[conversation.service] create failed:', error);
    return null;
  }
  return data as Conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  return (data as Message[]) ?? [];
}

/**
 * Appends one turn, with whatever annotation belongs to it.
 *
 * Failures are logged and swallowed for the same reason mistake.service does
 * it: history is a nice-to-have, and losing it must not take down the reply
 * the user is waiting on.
 */
export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  annotation?: { correction?: Correction | null; gloss?: WordGloss | null },
): Promise<string | null> {
  if (!content.trim()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        correction: annotation?.correction ?? null,
        gloss: annotation?.gloss ?? null,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  } catch (err) {
    console.error('[conversation.service] saveMessage failed:', err);
    return null;
  }
}

/**
 * Attaches an annotation to a message that's already stored.
 *
 * Needed because the correction and gloss arrive AFTER their message row does:
 * the user's text is saved the moment it arrives (worth keeping even if
 * everything downstream fails), and the reply is saved as soon as it finishes
 * streaming -- both before their respective LLM analyses have resolved.
 */
export async function annotateMessage(
  messageId: string,
  annotation: { correction?: Correction; gloss?: WordGloss },
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from('messages').update(annotation).eq('id', messageId);
  } catch (err) {
    console.error('[conversation.service] annotateMessage failed:', err);
  }
}

/**
 * Deletes one conversation, and with it every message in it -- `messages`
 * references `conversations` with ON DELETE CASCADE, so there's no second
 * query and no way to strand orphaned rows.
 *
 * Returns whether a row was really removed rather than just "didn't throw":
 * a delete that RLS filters out (someone else's id, or one that's already
 * gone) is not an error to Postgres, it simply matches zero rows. Reading
 * the deleted ids back with `.select('id')` is what lets the caller tell
 * "deleted" from "nothing happened", so the UI never navigates away from a
 * conversation that is still there.
 *
 * Saved vocabulary is untouched on purpose: `vocab_entries` has no link to a
 * conversation, and a word the learner chose to keep shouldn't vanish because
 * the chat it came from did. Same for `mistake_history`.
 *
 * `user_id` is redundant with the RLS policy but cheap defense-in-depth --
 * the same reasoning as deleteVocabEntry in vocab.service.ts.
 */
export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      console.error('[conversation.service] deleteConversation failed:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error('[conversation.service] deleteConversation failed:', err);
    return false;
  }
}
