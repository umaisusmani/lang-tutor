import { createServiceRoleClient } from '@/lib/supabase/service-role';

export type TranslationUsageResult =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: 'user' | 'global' | 'unavailable' };

export async function consumeTranslation(userId: string): Promise<TranslationUsageResult> {
  const { data, error } = await createServiceRoleClient().rpc('consume_translation', {
    p_user_id: userId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error('[translation.service] consume_translation failed:', error?.message);
    return { allowed: false, reason: 'unavailable' };
  }
  if (!row.allowed) {
    return { allowed: false, reason: row.reason === 'user' ? 'user' : 'global' };
  }
  return { allowed: true, remaining: row.remaining };
}
