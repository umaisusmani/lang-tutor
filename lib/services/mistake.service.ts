import type { MistakeType } from '@/lib/mistake-types';
import { createClient } from '@/lib/supabase/server';
import type { Correction } from '@/lib/tutor';
import type { MistakeRecord } from '@/lib/types/db';

/**
 * All reads and writes against `mistake_history`.
 *
 * Uses the session-scoped client rather than the service role on purpose: RLS
 * then guarantees a row can only ever be written for the calling user, so even
 * a bug in a caller cannot attribute someone's mistake to another account.
 */

/**
 * Persists a detected mistake. No-ops for anonymous users (nothing in
 * auth.users to attribute the row to, and RLS would reject the insert anyway)
 * and for corrections that found nothing.
 *
 * Failures are logged and swallowed: mistake history is a nice-to-have, and
 * must never take down the chat reply the user is waiting on.
 */
export async function recordMistake(
  userId: string | null,
  userInput: string,
  correction: Correction,
): Promise<void> {
  if (!userId || !correction.hasMistake || !correction.mistakeType) return;

  try {
    const supabase = await createClient();
    await supabase.from('mistake_history').insert({
      user_id: userId,
      mistake_type: correction.mistakeType,
      user_input: userInput,
      correction: correction.correction ?? '',
      explanation: correction.explanation ?? '',
    });
  } catch (err) {
    console.error('[mistake.service] insert failed:', err);
  }
}

/**
 * A user's past mistakes of one category, newest first. Backs the
 * personalization signal in step 5 -- "you've made this mistake before."
 */
export async function getMistakesByType(
  userId: string,
  mistakeType: MistakeType,
  limit = 5,
): Promise<MistakeRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('mistake_history')
    .select('*')
    .eq('user_id', userId)
    .eq('mistake_type', mistakeType)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data as MistakeRecord[]) ?? [];
}
