import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

import { buildWordLookupSystemPrompt } from '@/lib/prompts';
import { lowercaseTargetText } from '@/lib/language-case';
import { logUsage, type UsageContext } from '@/lib/services/usage.service';

const MODEL = 'openai/gpt-oss-120b';

const LookupSchema = z.object({
  words: z.array(z.object({
    lemma: z.string(),
    meaning: z.string(),
    example: z.string(),
    exampleTranslation: z.string(),
  })),
});

export type LookedUpWord = {
  lemma: string;
  meaning: string;
  example: string;
  exampleTranslation: string;
};

export function normalizeLookedUpWords(words: LookedUpWord[]): LookedUpWord[] {
  const seen = new Set<string>();
  const normalized: LookedUpWord[] = [];
  for (const word of words) {
    const entry = {
      lemma: word.lemma.trim().slice(0, 60),
      meaning: word.meaning.trim().slice(0, 80),
      example: word.example.trim().slice(0, 200),
      exampleTranslation: word.exampleTranslation.trim().slice(0, 200),
    };
    const key = lowercaseTargetText(entry.lemma);
    if (!key || !entry.meaning || seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
    if (normalized.length === 5) break;
  }
  return normalized;
}

export async function lookupWords(query: string, usageContext: UsageContext = {}): Promise<LookedUpWord[]> {
  const { object, usage } = await generateObject({
    model: groq(MODEL),
    schema: LookupSchema,
    system: buildWordLookupSystemPrompt(),
    prompt: query,
    temperature: 0,
    providerOptions: { groq: { reasoningEffort: 'low' } },
  });

  await logUsage('gloss', MODEL, usage, usageContext);
  return normalizeLookedUpWords(object.words);
}
