import { activeLanguage } from '@/lib/languages';

/**
 * App-wide constants that are content, not logic -- things worth editing
 * without reading any code around them.
 */

/** A conversation opener: the target-language text that gets sent, and the English shown
 * beneath it so a beginner knows what they're about to say. */
export type Starter = readonly [target: string, english: string];

/** How many starters the empty chat screen offers at once. */
export const STARTERS_SHOWN = 3;

/**
 * The pool the empty-chat starters are drawn from (app/page.tsx picks
 * STARTERS_SHOWN at random per visit).
 *
 * Deliberately not split by CEFR level: the point of the pool is variety, and
 * a starter is a first message the learner *sends*, which the correction pass
 * then grades against their own level. A slightly hard opener at A1 is
 * useful material rather than a mismatch -- the reply prompt keeps the tutor's
 * answer at the learner's level either way. Roughly a third are A1-A2,
 * a third B1, a third B1-B2.
 *
 * Add freely; the picker copes with any pool of STARTERS_SHOWN or more.
 */
export const STARTERS: readonly Starter[] = activeLanguage.starters;
