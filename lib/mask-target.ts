import { activeLanguage } from '@/lib/languages';
import { lowercaseTargetText } from '@/lib/language-case';
import type { LanguagePack } from '@/lib/languages/types';

/** Best effort hint masking: irregular inflections and changed stems may remain visible. */
export function maskTarget(sentence: string, lemma: string, strategy: LanguagePack['maskStrategy'] = activeLanguage.maskStrategy): string {
  const target = lowercaseTargetText(lemma);
  if (!target) return sentence;
  const stem = strategy === 'suffixing'
    ? target.replace(/(?:mek|mak)$/u, '')
    : target.slice(0, Math.max(3, target.length - 2));
  return sentence.replace(/\p{L}+/gu, (word) => {
    const normalized = lowercaseTargetText(word);
    const matches = strategy === 'suffixing'
      ? normalized === target || (stem.length >= 3 && normalized.startsWith(stem))
      : normalized === target || (target.length >= 5 && normalized.startsWith(stem));
    return matches ? '____' : word;
  });
}
