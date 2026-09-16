import type { LanguageModelUsage } from 'ai';

import { createServiceRoleClient, hasServiceRoleEnv } from '@/lib/supabase/service-role';
import type { UsageEndpoint } from '@/lib/types/db';

export type UsageContext = {
  userId?: string | null;
  sessionId?: string | null;
};

/**
 * Records token consumption for one LLM call.
 *
 * Writes through the service-role client because `token_usage` has RLS enabled
 * with zero policies -- no user session can touch it by design. Console logging
 * is kept alongside the insert: it's what makes local `npm run dev` output
 * legible while iterating, and it's the only visibility the eval runner gets.
 *
 * Errors are logged and swallowed. Usage tracking is observability; a failed
 * insert must never take down a reply the user is waiting on.
 */
export async function logUsage(
  endpoint: UsageEndpoint,
  model: string,
  usage: LanguageModelUsage,
  context: UsageContext = {},
): Promise<void> {
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens;
  console.log(
    `[usage] ${endpoint} (${model}): ${usage.totalTokens ?? '?'} tokens` +
      ` (input ${usage.inputTokens ?? '?'}, output ${usage.outputTokens ?? '?'}` +
      (reasoningTokens != null ? `, of which reasoning ${reasoningTokens}` : '') +
      ')',
  );

  // The eval runner imports lib/tutor.ts directly, with no Supabase env wired
  // up. Skip the insert there rather than crashing a local eval run.
  if (!hasServiceRoleEnv()) return;

  try {
    const supabase = createServiceRoleClient();
    await supabase.from('token_usage').insert({
      endpoint,
      model,
      prompt_tokens: usage.inputTokens ?? null,
      completion_tokens: usage.outputTokens ?? null,
      total_tokens: usage.totalTokens ?? null,
      user_id: context.userId ?? null,
      session_id: context.sessionId ?? null,
    });
  } catch (err) {
    console.error('[usage.service] failed to persist:', err);
  }
}
