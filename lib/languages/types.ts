/**
 * A language pack groups one supported language's configuration in one object,
 * selected at deploy time.
 */
import type { PersonaProfile } from '@/lib/personas';
import type { CefrLevel } from '@/lib/prompts';
import type { Starter } from '@/lib/constants';

export type TopicKind = 'story' | 'opinion' | 'plan' | 'person' | 'ask';

/** One thing the persona could bring up. `text` is an instruction-style hook in
 * English; the model writes the target-language reply. `basic` marks topics
 * simple enough for A1 learners. */
export interface TopicSeed {
  kind: TopicKind;
  text: string;
  basic?: true;
}

export interface LanguagePack<
  Mistakes extends readonly [string, ...string[]] = readonly [string, ...string[]],
  Code extends string = 'de' | 'tr',
> {
  code: Code;
  name: string;
  promptLanguageName: string;
  appName: string;
  appDescription: string;
  themeColor: string;
  backgroundColor: string;
  pwaIconColors: { background: string; ink: string };
  displayFace: 'londrina-solid' | 'baloo-2';
  composerPlaceholder: string;
  chatWelcomeHeading: { beforeAccent: string; accent: string; afterAccent: string };
  sendButtonLabel: string;
  askExamples: readonly string[];
  starters: readonly Starter[];
  correctionOrthography: string;
  correctionCategoryRules: string;
  correctionEnglishExamples: {
    standIn: string;
    sharedWords: string;
    loanwords: string;
    nounArticle: string;
  };
  secondLookErrorTypes: string;
  secondLookOrthography: string;
  glossFunctionWords: string;
  wordLookupNounMeaning: string;
  explanationNounArticle: string;
  explanationGrammarExamples: string;
  glossSplitVerbExample: string;
  lemmaPrefixes: readonly string[];
  emphasizeSeparableParticle: boolean;
  reportCapitalization: boolean;
  maskStrategy: 'german-stem' | 'suffixing';
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
  /** Pool the persona draws per-turn conversation ideas from (lib/topics.ts). */
  topicSeeds?: readonly TopicSeed[];
  translatorDirections: {
    targetToEnglish: `${Code}-en`;
    englishToTarget: `en-${Code}`;
    azureLanguageCode: Code;
  };
}
