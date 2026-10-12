import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import { z } from 'zod';

import { logUsage, type UsageContext } from '@/lib/services/usage.service';
import type { StarterWord } from '@/lib/starter-vocab';

const MODEL = 'openai/gpt-oss-120b';

/**
 * The English meaning of one starter word, as a short dictionary gloss.
 * The word list has no per-word translations, only a sentence and its
 * translation, so the model gets those to pick the right sense ("die Bank"
 * as bank or bench) and returns just the word's meaning.
 *
 * Runs once per word the learner adds, so a full list is never translated.
 */
export async function translateStarterWord(
  word: StarterWord,
  usageContext: UsageContext = {},
): Promise<string> {
  const { object, usage } = await generateObject({
    model: groq(MODEL),
    schema: z.object({ translation: z.string() }),
    system:
      'You translate one German dictionary word into English for a learner\'s vocabulary list. ' +
      'Reply with the short dictionary meaning only: 1-3 words, no article for nouns ' +
      '("the bank" -> "bank"), "to ..." for verbs. Use the example sentence only to choose the right sense.',
    prompt: `Word: ${word.lemma}\nExample: ${word.example}\nExample translation: ${word.exampleTranslation}`,
    temperature: 0,
    providerOptions: { groq: { reasoningEffort: 'low' } },
  });

  // 'gloss' is the existing usage endpoint for per-word translation; a new
  // endpoint would mean another migration for no reporting benefit yet.
  await logUsage('gloss', MODEL, usage, usageContext);
  return object.translation.trim().slice(0, 80);
}
