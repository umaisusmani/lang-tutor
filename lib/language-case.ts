import { activeLanguage } from '@/lib/languages';

/** Lowercase target-language text using the active pack's casing rules. */
export function lowercaseTargetText(value: string): string {
  return value.toLocaleLowerCase(activeLanguage.localeTag);
}
