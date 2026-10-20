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

export type ReviewSummary = {
  reviewed: number;
  scheduledLater: number;
  nextReviewAt: string | null;
  complete: boolean;
};
