import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

import { buildGlossSystemPrompt } from '@/lib/prompts';
import { logUsage, type UsageContext } from '@/lib/services/usage.service';

const GLOSS_MODEL = 'openai/gpt-oss-120b';

/** Shared shape for a word-by-word gloss -- reused by both the reply gloss
 * (this file) and the correction's corrected-sentence gloss (lib/tutor.ts),
 * so the two features render identically on the client. */
export const WordGlossSchema = z.array(
  z.object({
    word: z.string(),
    translation: z.string(),
  }),
);

export type WordGloss = z.infer<typeof WordGlossSchema>;

/**
 * Breaks a German sentence (or short passage) into a word-by-word English
 * gloss. Pure function, same reasoning as detectCorrection() in lib/tutor.ts:
 * no HTTP objects, so it's callable directly from both the chat route and any
 * future eval script.
 *
 * This is a THIRD LLM call per exchange (chat reply + correction check +
 * this), fired only after the reply's full text exists -- it cannot run
 * concurrently with reply generation the way correction detection does, since
 * there's nothing to gloss until the reply is finished. Runs unconditionally
 * on every message by design: the UI hides it behind a hover/icon reveal, but
 * it's always fetched so there's no loading delay when a learner asks to see
 * it.
 */
// Groq's structured-output mode rejects a bare array as the top-level schema
// ("schema must have type 'object' ... at the top level") -- it's fine nested
// inside CorrectionSchema's `correctionGloss` field, but glossText() calls
// generateObject with this schema directly as the top level, so it has to be
// wrapped in an object here and unwrapped after.
const GlossResponseSchema = z.object({ words: WordGlossSchema });

export async function glossText(
  text: string,
  usageContext: UsageContext = {},
): Promise<WordGloss> {
  const { object, usage } = await generateObject({
    model: groq(GLOSS_MODEL),
    schema: GlossResponseSchema,
    system: buildGlossSystemPrompt(),
    prompt: text,
    temperature: 0,
    providerOptions: {
      groq: { reasoningEffort: 'low' },
    },
  });

  await logUsage('gloss', GLOSS_MODEL, usage, usageContext);

  return object.words;
}
