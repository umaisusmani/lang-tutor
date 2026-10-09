'use server';

import { revalidatePath } from 'next/cache';

import { recordReview, type RecordReviewResult } from '@/lib/services/card.service';
import { getCurrentUserId } from '@/lib/services/profile.service';
import type { Grade } from '@/lib/srs';
import type { ReviewSurface } from '@/lib/types/db';

/**
 * Grades one card. The user id comes from the session, never the client, and
 * the card is re-read server-side (see recordReview) -- the client sends only
 * which card and which button.
 *
 * `rating` and `surface` arrive from the browser, so both are validated here
 * rather than trusted to be the unions their types say.
 */
export async function gradeCardAction(
  cardId: string,
  rating: number,
  meta: { surface: ReviewSurface; durationMs?: number; answerGiven?: string },
): Promise<RecordReviewResult | { status: 'unauthenticated' }> {
  const userId = await getCurrentUserId();
  if (!userId) return { status: 'unauthenticated' };

  if (!Number.isInteger(rating) || rating < 1 || rating > 4) return { status: 'error' };
  if (meta.surface !== 'panel' && meta.surface !== 'review_page') return { status: 'error' };

  const result = await recordReview(userId, cardId, rating as Grade, meta);
  // The header's due badge is rendered by other pages' Server Components.
  if (result.status === 'ok') revalidatePath('/', 'layout');
  return result;
}
