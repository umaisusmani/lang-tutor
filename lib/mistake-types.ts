import { mistakeTypes } from '@/lib/languages';
import type { de } from '@/lib/languages/de';
import type { tr } from '@/lib/languages/tr';

export const MISTAKE_TYPES = mistakeTypes;

export type MistakeType = (typeof de.mistakeTypes)[number] | (typeof tr.mistakeTypes)[number];

export function isMistakeType(value: string | undefined | null): value is MistakeType {
  return !!value && (MISTAKE_TYPES as readonly string[]).includes(value);
}
