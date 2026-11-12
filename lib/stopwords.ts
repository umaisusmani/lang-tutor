import { stopwords } from '@/lib/languages';
import { lowercaseTargetText } from '@/lib/language-case';

export function isStopword(lemma: string): boolean {
  return stopwords.has(lowercaseTargetText(lemma));
}
