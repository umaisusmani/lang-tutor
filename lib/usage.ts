import type { LanguageModelUsage } from 'ai';

/**
 * Logs token consumption for one LLM call. Console-only for now (step 2) —
 * step 3 swaps the body of this function for a `token_usage` table insert
 * once Supabase exists. Call sites (route handlers, lib/tutor.ts) never
 * change, only this implementation does.
 */
export function logUsage(endpoint: 'chat' | 'correction', model: string, usage: LanguageModelUsage) {
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens;
  console.log(
    `[usage] ${endpoint} (${model}): ${usage.totalTokens ?? '?'} tokens` +
      ` (input ${usage.inputTokens ?? '?'}, output ${usage.outputTokens ?? '?'}` +
      (reasoningTokens != null ? `, of which reasoning ${reasoningTokens}` : '') +
      ')',
  );
}
