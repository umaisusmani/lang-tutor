import { de } from '@/lib/languages/de';
import { tr } from '@/lib/languages/tr';
import type { LanguagePack } from '@/lib/languages/types';

type PackMistakes = typeof de.mistakeTypes | typeof tr.mistakeTypes;
type PackCode = typeof de.code | typeof tr.code;
const packs: Record<PackCode, LanguagePack<PackMistakes, PackCode>> = { de, tr };

export const activeLanguage: LanguagePack<PackMistakes, PackCode> =
  packs[(process.env.NEXT_PUBLIC_APP_LANGUAGE ?? 'de') as PackCode] ?? de;

export const {
  code, name, promptLanguageName, mistakeTypes, stopwords, fallbackPersona,
  levelGuidance, strictnessByLevel, conversationStyle, lemmaRules, personaWording,
  translatorDirections,
} = activeLanguage;
