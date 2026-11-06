/** Best effort hint masking: irregular inflections and changed stems may remain visible. */
export function maskTarget(sentence: string, lemma: string): string {
  const target = lemma.toLocaleLowerCase('de');
  if (!target) return sentence;
  const stem = target.slice(0, Math.max(3, target.length - 2));
  return sentence.replace(/\p{L}+/gu, (word) => {
    const normalized = word.toLocaleLowerCase('de');
    return normalized === target || (target.length >= 5 && normalized.startsWith(stem)) ? '____' : word;
  });
}
