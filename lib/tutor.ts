import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

import { MISTAKE_TYPES } from '@/lib/mistake-types';
import { buildCorrectionSystemPrompt, DEFAULT_CEFR_LEVEL, type CefrLevel } from '@/lib/prompts';
import { logUsage } from '@/lib/usage';

const CORRECTION_MODEL = 'openai/gpt-oss-120b';

const CorrectionSchema = z.object({
  hasMistake: z.boolean(),
  mistakeType: z.enum(MISTAKE_TYPES).nullable(),
  correction: z.string().nullable(),
  explanation: z.string().nullable(),
});

export type Correction = z.infer<typeof CorrectionSchema>;

/**
 * Classifies a single learner message for grammar mistakes. Pure function —
 * no HTTP, no request/response objects — so both the chat route and the
 * eval runner (scripts/run-evals.ts) can call it directly and get identical
 * behaviour. This is the exact reason this logic doesn't live inline in
 * app/api/chat/route.ts.
 */
export async function detectCorrection(
  userMessage: string,
  level: CefrLevel = DEFAULT_CEFR_LEVEL,
): Promise<Correction> {
  const { object, usage } = await generateObject({
    model: groq(CORRECTION_MODEL),
    schema: CorrectionSchema,
    system: buildCorrectionSystemPrompt(level),
    prompt: userMessage,
    // This is classification, not creative writing -- there's one correct
    // answer, so temperature 0 for determinism. The eval suite caught a
    // real case where the default temperature produced a different verdict
    // on an identical input across two runs.
    temperature: 0,
    providerOptions: {
      // Classification doesn't need deep reasoning either -- same rationale
      // as the conversation route.
      groq: { reasoningEffort: 'low' },
    },
  });

  logUsage('correction', CORRECTION_MODEL, usage);

  return object;
}
