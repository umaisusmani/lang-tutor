import type { Correction } from '@/lib/tutor';

/**
 * Whether a correction has a card to show: a real mistake, or English words
 * to put into German. Both need the corrected sentence -- a verdict without
 * one is treated as a failed check (see chat.service.ts), not a card.
 *
 * Its own module, not lib/tutor.ts, because app/chat.tsx needs it too and
 * tutor.ts imports the Groq SDK -- which a client component would drag into
 * the browser bundle. This imports only a type, which compiles away.
 */
export function hasCorrectionCard(correction: Correction): boolean {
  return (correction.hasMistake || !!correction.usedEnglish) && !!correction.correction;
}
