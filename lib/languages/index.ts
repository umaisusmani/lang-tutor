import { de } from '@/lib/languages/de';
import type { LanguagePack } from '@/lib/languages/types';

// Register the planned tr pack here when it is added.
const packs: Record<string, LanguagePack<typeof de.mistakeTypes>> = { de };

export const activeLanguage: LanguagePack<typeof de.mistakeTypes> =
  packs[process.env.NEXT_PUBLIC_APP_LANGUAGE ?? 'de'] ?? de;

export const {
  code, name, promptLanguageName, mistakeTypes, stopwords, fallbackPersona,
  levelGuidance, strictnessByLevel, conversationStyle, lemmaRules, personaWording,
  translatorDirections,
} = activeLanguage;
