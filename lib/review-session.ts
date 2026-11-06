/** Select one usable direction per word before calculating a session's size. */
export function selectReviewWords<T extends {
  vocab_entry_id: string | null;
  vocab_entry: { translation: string | null } | null;
}>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.vocab_entry_id || !item.vocab_entry?.translation?.trim()) return false;
    if (seen.has(item.vocab_entry_id)) return false;
    seen.add(item.vocab_entry_id);
    return true;
  });
}

/** Skip reviewed words and siblings before applying a new-word allowance or offset. */
export function pickNewWords<T extends {
  vocab_entry_id: string | null;
  vocab_entry: { translation: string | null } | null;
}>(cards: T[], reviewedWords: Set<string>, count: number, skip = 0): T[] {
  return selectReviewWords(cards.filter((card) => !reviewedWords.has(card.vocab_entry_id ?? '')))
    .slice(skip, skip + count);
}

export type ReviewSummary = {
  reviewed: number;
  added: number;
  scheduledLater: number;
  nextReviewAt: string | null;
  complete: boolean;
};
