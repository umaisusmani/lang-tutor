/**
 * A language pack groups one supported language's configuration in one object,
 * selected at deploy time.
 */
import type { PersonaProfile } from '@/lib/personas';
import type { CefrLevel } from '@/lib/prompts';

export interface LanguagePack<
  Mistakes extends readonly [string, ...string[]] = readonly [string, ...string[]],
  Code extends string = 'de',
> {
  code: Code;
  name: string;
  promptLanguageName: string;
  localeTag: string;
  wordEdgeCharacters: string;
  foldPairs: readonly (readonly [string, string])[];
  mistakeTypes: Mistakes;
  stopwords: ReadonlySet<string>;
  fallbackPersona: PersonaProfile;
  levelGuidance: Record<CefrLevel, string>;
  strictnessByLevel: Record<CefrLevel, string>;
  conversationStyle: string;
  lemmaRules: string;
  personaWording: string;
  translatorDirections: {
    targetToEnglish: `${Code}-en`;
    englishToTarget: `en-${Code}`;
    azureLanguageCode: Code;
  };
}
