import { mistakeTypes } from '@/lib/languages';

export const MISTAKE_TYPES = mistakeTypes;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export function isMistakeType(value: string | undefined | null): value is MistakeType {
  return !!value && (MISTAKE_TYPES as readonly string[]).includes(value);
}
