import type { CefrLevel } from '@/lib/prompts';

export interface ReplyEvalCase {
  id: string;
  level: CefrLevel;
  /** The learner's turns so far, oldest first. The model replies to the last. */
  turns: string[];
  /** Words the reply must contain (case-insensitive) -- used to check that an
   * English stand-in comes back in German. */
  expectContains?: string[];
  note: string;
}

/**
 * The limits buildConversationSystemPrompt() sets for A1/A2, as numbers the
 * runner can check. Kept next to the cases rather than exported from
 * lib/prompts.ts: the prompt states them in prose for the model, and this is
 * the test's own reading of that prose -- if one changes, update the other.
 */
export const REPLY_LIMITS: Partial<
  Record<CefrLevel, { maxSentences: number; maxWordsPerSentence: number; bannedWords: string[] }>
> = {
  A1: {
    maxSentences: 3,
    maxWordsPerSentence: 8,
    bannedWords: ['weil', 'dass', 'wenn', 'ob', 'obwohl', 'damit'],
  },
  A2: { maxSentences: 3, maxWordsPerSentence: 12, bannedWords: ['obwohl', 'damit'] },
};

/** Phrases that make the persona sound like an assistant, at any level. */
export const HELPER_PHRASES = [/wie kann ich (dir|ihnen) helfen/i, /kann ich dir (noch )?(bei etwas )?helfen/i];

/**
 * A scripted conversation, replied to turn by turn with the real history, to
 * measure how often her replies end in a question -- the "feels like an
 * interview" complaint. Single-turn cases can't: whether a reply may ask is
 * decided from the previous reply (buildTurnGuidance), and they have none.
 * Short learner answers on purpose: they're what tempts a partner into
 * question after question.
 */
export const QUESTION_SHARE_CONVERSATION: { level: CefrLevel; turns: string[] } = {
  level: 'A1',
  turns: [
    'Hallo! Ich heiße Sam.',
    'Ich wohne in London.',
    'Ja, es ist groß.',
    'Ich arbeite viel.',
    'Ich koche gern.',
    'Pasta.',
    'Ja, lecker!',
    'Heute bin ich müde.',
  ],
};

/** At most this share of QUESTION_SHARE_CONVERSATION's replies may end in a
 * question. buildTurnGuidance() caps it near half; above that, it's broken. */
export const MAX_QUESTION_SHARE = 0.5;

/**
 * Reply cases for the conversation prompt. Weighted toward A1, which is what
 * QA questioned, and toward the openers most likely to pull the model above
 * the learner's level: a starter written at B1, a learner who writes long,
 * and a very short answer (where the persona has to bring a topic of her own).
 */
export const REPLY_EVAL_CASES: ReplyEvalCase[] = [
  { id: 'a1-greeting', level: 'A1', turns: ['Hallo! Wie geht es dir?'], note: 'Simplest opener.' },
  { id: 'a1-weekend', level: 'A1', turns: ['Wie war dein Wochenende?'], note: 'Invites past tense -- A1 must stay in the present.' },
  { id: 'a1-hobby', level: 'A1', turns: ['Ich spiele gern Fußball.'], note: 'Short statement, no question to answer.' },
  { id: 'a1-short-answer', level: 'A1', turns: ['Hallo!', 'Gut.'], note: 'Minimal answer: the persona should bring a topic, still at A1.' },
  {
    id: 'a1-hard-starter',
    level: 'A1',
    turns: ['Was würdest du machen, wenn du viel Geld hättest?'],
    note: 'A B1 starter (Konjunktiv) -- the reply must not mirror its complexity.',
  },
  {
    id: 'a1-english-word',
    level: 'A1',
    turns: ['Ich habe einen dog.'],
    expectContains: ['Hund'],
    note: 'English stand-in: the reply should use the German word.',
  },
  { id: 'a1-food', level: 'A1', turns: ['Ich esse gern Pizza. Und du?'], note: 'Direct question about the persona -- she should answer about herself.' },
  { id: 'a2-work', level: 'A2', turns: ['Ich arbeite in einem Büro. Es ist langweilig.'], note: 'Opinion to react to.' },
  { id: 'a2-travel', level: 'A2', turns: ['Ich möchte im Sommer nach Deutschland reisen.'], note: 'Invites a long, advice-giving reply.' },
  {
    id: 'a2-english-word',
    level: 'A2',
    turns: ['Am Samstag gehe ich hiking in den Bergen.'],
    expectContains: ['wander'],
    note: 'English stand-in at A2 -- the stem, so wandern / Wanderung / Wanderziel all count.',
  },
  { id: 'b1-city', level: 'B1', turns: ['Wie ist es, in Düsseldorf zu wohnen?'], note: 'About the persona herself: she should talk about her own life.' },
  { id: 'b1-music', level: 'B1', turns: ['Welche Musik hörst du gern?'], note: 'Only checked for helper phrasing.' },
];
