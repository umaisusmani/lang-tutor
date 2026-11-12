import { lowercaseTargetText } from '@/lib/language-case';

/** Best effort hint masking: irregular inflections and changed stems may remain visible. */
export function maskTarget(sentence: string, lemma: string): string {
  const target = lowercaseTargetText(lemma);
  if (!target) return sentence;
  const stem = target.slice(0, Math.max(3, target.length - 2));
  return sentence.replace(/\p{L}+/gu, (word) => {
    const normalized = lowercaseTargetText(word);
    return normalized === target || (target.length >= 5 && normalized.startsWith(stem)) ? '____' : word;
  });
}
