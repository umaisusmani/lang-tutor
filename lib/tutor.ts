import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

import { WordGlossSchema } from '@/lib/gloss';
import { hasCorrectionCard } from '@/lib/correction-card';
import { MISTAKE_TYPES } from '@/lib/mistake-types';
import {
  buildCorrectionSecondLookPrompt,
  buildCorrectionSystemPrompt,
  DEFAULT_CEFR_LEVEL,
  type CefrLevel,
} from '@/lib/prompts';
import { logUsage, type UsageContext } from '@/lib/services/usage.service';

const CORRECTION_MODEL = 'openai/gpt-oss-120b';

const CorrectionSchema = z.object({
  hasMistake: z.boolean(),
  // The learner used English for words they didn't know -- invited by the UI,
  // so it's not a mistake: it doesn't set hasMistake and isn't recorded in
  // mistake_history. It still produces a `correction` (the all-German
  // version), shown under an "in German" label instead of a mistake type.
  // Absent on corrections stored before it existed; read as false.
  usedEnglish: z.boolean(),
  mistakeType: z.enum(MISTAKE_TYPES).nullable(),
  correction: z.string().nullable(),
  // Whole-sentence English translation of `correction`, same call.
  correctionTranslation: z.string().nullable(),
  explanation: z.string().nullable(),
  // Word-by-word gloss of `correction`, not `userMessage` -- rides on this
  // same call for free (no extra request), unlike the reply gloss in
  // lib/gloss.ts, which needs its own call since it glosses different text.
  correctionGloss: WordGlossSchema.nullable(),
});

export type Correction = z.infer<typeof CorrectionSchema>;

/** A model can still flag keyboard spelling after being asked to ignore it.
 * If its full correction changes no words beyond case, diacritics, ß, or
 * punctuation, there is no mistake card or English stand-in to show. */
export function suppressOrthographicOnlyCorrection(
  userMessage: string,
  result: Correction,
): Correction {
  if (!result.correction || (!result.hasMistake && !result.usedEnglish)) return result;

  const words = (text: string) =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/ß/g, 'ss')
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? '';

  const original = words(userMessage);
  if (!original || original !== words(result.correction)) return result;

  return {
    hasMistake: false,
    usedEnglish: false,
    mistakeType: null,
    correction: null,
    correctionTranslation: null,
    explanation: null,
    correctionGloss: null,
  };
}

/** A clean first verdict gets an independent second look. A positive verdict
 * without a sentence is retried too, then treated as a failed check if the
 * second pass cannot produce a usable correction. */
export async function checkWithSecondLook(
  check: (secondLook: boolean) => Promise<Correction>,
): Promise<Correction> {
  const first = await check(false);
  if (hasCorrectionCard(first)) return first;

  const second = await check(true);
  if (hasCorrectionCard(second)) return second;

  if (first.hasMistake || first.usedEnglish || second.hasMistake || second.usedEnglish) {
    throw new Error('correction verdict without a corrected sentence');
  }
  if (second.correction?.trim()) {
    throw new Error('corrected sentence without a correction verdict');
  }
  return second;
}

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
  usageContext: UsageContext = {},
): Promise<Correction> {
  return checkWithSecondLook(async (secondLook) => {
    const { object, usage } = await generateObject({
      model: groq(CORRECTION_MODEL),
      schema: CorrectionSchema,
      system: secondLook
        ? buildCorrectionSecondLookPrompt(level)
        : buildCorrectionSystemPrompt(level),
      prompt: userMessage,
      // Classification should be steady across runs; the second look uses
      // a different checklist rather than randomizing the same prompt.
      temperature: 0,
      providerOptions: {
        groq: { reasoningEffort: 'low' },
      },
    });

    await logUsage('correction', CORRECTION_MODEL, usage, usageContext);
    const verdict = suppressOrthographicOnlyCorrection(userMessage, object);
    if (secondLook && hasCorrectionCard(verdict)) {
      console.info('[correction] second look recovered a missed correction');
    }
    return verdict;
  });
}
