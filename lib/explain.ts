import { groq } from '@ai-sdk/groq';
import { streamText } from 'ai';

import { buildGrammarExplanationPrompt, type CefrLevel } from '@/lib/prompts';
import { logUsage, type UsageContext } from '@/lib/services/usage.service';

const EXPLAIN_MODEL = 'openai/gpt-oss-120b';

export type ExplainKind = 'reply' | 'correction';

/**
 * Streams a plain-language grammar explanation of a reply, or of a correction.
 *
 * On demand, unlike the gloss and correction: most learners won't press the
 * button on most messages, so generating one per turn would pay for text
 * nobody reads. Streamed rather than generateObject'd because it's prose the
 * learner reads as it arrives -- there's no structure to validate.
 *
 * `onText` gets the finished text, for the caller to persist. It's called
 * from streamText's onFinish, which runs before the response stream closes.
 */
export function streamGrammarExplanation(input: {
  kind: ExplainKind;
  text: string;
  /** What the learner originally wrote -- correction only. */
  original?: string;
  level: CefrLevel;
  usageContext?: UsageContext;
  onText?: (text: string) => Promise<void>;
}) {
  const { kind, text, original, level, usageContext = {}, onText } = input;

  return streamText({
    model: groq(EXPLAIN_MODEL),
    system: buildGrammarExplanationPrompt(level, kind),
    prompt: kind === 'correction' ? `Learner wrote: ${original ?? ''}\nCorrect: ${text}` : text,
    providerOptions: {
      // Explaining a rule needs a bit more thought than chatting does, but
      // not deep multi-step reasoning -- same budget trade-off as the reply.
      groq: { reasoningEffort: 'low' },
    },
    onFinish: async ({ text: finished, totalUsage }) => {
      await logUsage('explain', EXPLAIN_MODEL, totalUsage, usageContext);
      if (onText && finished.trim()) await onText(finished);
    },
  });
}
