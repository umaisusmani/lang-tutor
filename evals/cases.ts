import type { CefrLevel } from '@/lib/prompts';
import type { MistakeType } from '@/lib/mistake-types';

export interface EvalCase {
  id: string;
  level: CefrLevel;
  input: string;
  expectHasMistake: boolean;
  /** Only checked when expectHasMistake is true. */
  expectMistakeType?: MistakeType;
  /** Checked only when set -- most cases are all-German and don't care. */
  expectUsedEnglish?: boolean;
  note: string;
}

/**
 * Curated cases: one or more per mistake type, several correct-sentence
 * controls (to catch over-correction), a case error checked at two levels,
 * and robustness checks on trivial input.
 */
export const EVAL_CASES: EvalCase[] = [
  // --- One real example per mistake type ---
  {
    id: 'word-order-1',
    level: 'B1',
    input: 'Heute ich gehe ins Kino.',
    expectHasMistake: true,
    expectMistakeType: 'word_order',
    note: 'Verb-second rule violated (time expression should push the verb, not the subject, into position 2).',
  },
  {
    id: 'word-order-2',
    level: 'B1',
    input: 'Ich weiß nicht, wo ist der Bahnhof.',
    expectHasMistake: true,
    expectMistakeType: 'word_order',
    note: 'Subordinate clause needs verb-final order: "wo der Bahnhof ist".',
  },
  {
    id: 'case-declension-1',
    level: 'B1',
    input: 'Ich sehe der Mann im Park.',
    expectHasMistake: true,
    expectMistakeType: 'case_declension',
    note: 'Accusative required after "sehen": "den Mann".',
  },
  {
    id: 'gender-article-1',
    level: 'A2',
    input: 'Der Mädchen spielt im Garten.',
    expectHasMistake: true,
    expectMistakeType: 'gender_article',
    note: '"Mädchen" is grammatically neuter: "Das Mädchen".',
  },
  {
    id: 'verb-conjugation-1',
    level: 'A2',
    input: 'Er gehen jeden Tag zur Arbeit.',
    expectHasMistake: true,
    expectMistakeType: 'verb_conjugation',
    note: 'Third person singular needs "geht", not the infinitive/plural form.',
  },
  {
    id: 'verb-conjugation-a1',
    level: 'A1',
    input: 'Er gehen jeden Tag zur Arbeit.',
    expectHasMistake: true,
    expectMistakeType: 'verb_conjugation',
    note: 'A clear verb-form error should still get a correction at A1.',
  },
  {
    id: 'auxiliary-verb-1',
    level: 'B1',
    input: 'Ich habe gestern nach Berlin gefahren.',
    expectHasMistake: true,
    expectMistakeType: 'auxiliary_verb',
    note: 'Verbs of motion take "sein" in the perfect tense: "bin gefahren".',
  },
  {
    id: 'preposition-1',
    level: 'B1',
    input: 'Ich freue mich für das Geschenk.',
    expectHasMistake: true,
    expectMistakeType: 'preposition',
    note: '"sich freuen" takes "über" (for a specific reason/thing), not "für".',
  },
  {
    id: 'adjective-ending-1',
    level: 'B1',
    input: 'Ich habe ein rot Auto gekauft.',
    expectHasMistake: true,
    expectMistakeType: 'adjective_ending',
    note: 'Attributive adjective before a neuter noun needs an ending: "ein rotes Auto".',
  },
  {
    id: 'plural-form-1',
    level: 'A2',
    input: 'Meine Schwester hat drei Kind.',
    expectHasMistake: true,
    expectMistakeType: 'plural_form',
    note: '"Kind" pluralizes irregularly: "drei Kinder".',
  },
  {
    id: 'word-choice-1',
    level: 'A2',
    input: 'Ich weiß deine Schwester nicht.',
    expectHasMistake: true,
    expectMistakeType: 'word_choice',
    note: '"wissen" (to know facts) confused with "kennen" (to know a person) -- purely lexical, no other structural issue in the sentence.',
  },
  {
    id: 'word-choice-2',
    level: 'B1',
    input: 'Das war eine sehr excited Erfahrung für mich.',
    expectHasMistake: false,
    expectUsedEnglish: true,
    note: 'English code-switching ("aufregende" expected). Was a word_choice mistake until the UI started inviting English for unknown words -- now usedEnglish, shown as "in German", not recorded as a mistake.',
  },

  // --- Correct sentences: should NOT be flagged (catches over-correction) ---
  {
    id: 'correct-a1',
    level: 'A1',
    input: 'Ich heiße Anna. Ich komme aus Spanien.',
    expectHasMistake: false,
    note: 'Simple, fully correct A1 sentence.',
  },
  {
    id: 'correct-a2',
    level: 'A2',
    input: 'Gestern bin ich ins Kino gegangen und habe einen guten Film gesehen.',
    expectHasMistake: false,
    note: 'Correct Perfekt with the right auxiliary for both verbs.',
  },
  {
    id: 'correct-b1',
    level: 'B1',
    input: 'Obwohl es regnet, gehe ich heute spazieren.',
    expectHasMistake: false,
    note: 'Correct subordinate clause with verb-final order.',
  },
  {
    id: 'correct-b2',
    level: 'B2',
    input: 'Nachdem ich die Prüfung bestanden hatte, habe ich mit meinen Freunden gefeiert.',
    expectHasMistake: false,
    note: 'Correct Plusquamperfekt in the subordinate clause.',
  },
  {
    id: 'correct-c1',
    level: 'C1',
    input: 'Es ist nicht auszuschließen, dass sich die Lage in den kommenden Wochen weiter verschärft.',
    expectHasMistake: false,
    note: 'Correct, idiomatic, complex C1-level construction.',
  },
  {
    id: 'keyboard-and-capitalization-a1',
    level: 'A1',
    input: 'Was ist das buch uber',
    expectHasMistake: false,
    expectUsedEnglish: false,
    note: 'Missing noun capitalization and an umlaut are typing conventions, not grammar mistakes or English stand-ins.',
  },
  {
    id: 'keyboard-and-capitalization-b2',
    level: 'B2',
    input: 'Was ist das buch uber',
    expectHasMistake: false,
    expectUsedEnglish: false,
    note: 'The same relaxed spelling rule applies even at a higher level.',
  },
  {
    id: 'capitalization-only',
    level: 'A2',
    input: 'ich lese das buch.',
    expectHasMistake: false,
    expectUsedEnglish: false,
    note: 'Sentence-initial and noun capitalization alone should not produce a correction.',
  },

  // --- Clear case errors should be corrected at every level ---
  {
    id: 'case-error-a1',
    level: 'A1',
    input: 'Ich gehe zu Schule.',
    expectHasMistake: true,
    expectMistakeType: 'case_declension',
    note: 'Missing contraction "zur" (zu der) is a clear case/article error even at A1.',
  },
  {
    id: 'case-error-c1',
    level: 'C1',
    input: 'Ich gehe zu Schule.',
    expectHasMistake: true,
    expectMistakeType: 'case_declension',
    note: 'The same clear error remains a mistake at C1.',
  },

  // --- Robustness: trivial/short input shouldn't crash or false-positive ---
  {
    id: 'trivial-input',
    level: 'A1',
    input: 'Hallo!',
    expectHasMistake: false,
    note: 'Trivial greeting -- nothing to correct, should not crash on short input.',
  },
  {
    id: 'trivial-input-2',
    level: 'B1',
    input: 'Ja, genau.',
    expectHasMistake: false,
    note: 'Trivial acknowledgement -- nothing to correct.',
  },

  // --- English stand-ins: invited by the UI, so flagged as usedEnglish, never as a mistake ---
  {
    id: 'english-word-clean',
    level: 'A1',
    input: 'Ich habe einen dog.',
    expectHasMistake: false,
    expectUsedEnglish: true,
    note: 'Correct German around one English noun -- not a mistake, but the card should show "der Hund".',
  },
  {
    id: 'english-phrase-clean',
    level: 'A2',
    input: 'Am Wochenende gehe ich oft hiking mit meinen Freunden.',
    expectHasMistake: false,
    expectUsedEnglish: true,
    note: 'English activity word in otherwise correct German.',
  },
  {
    id: 'english-word-with-mistake',
    level: 'B1',
    input: 'Gestern ich habe ein neues laptop bag gekauft.',
    expectHasMistake: true,
    expectMistakeType: 'word_order',
    expectUsedEnglish: true,
    note: 'Both at once: verb-second is broken AND English words stand in -- each flag judged on its own.',
  },
  {
    id: 'german-loanword-not-english',
    level: 'A2',
    input: 'Mein Handy ist kaputt.',
    expectHasMistake: false,
    expectUsedEnglish: false,
    note: '"Handy" is the German word -- a loanword German uses is not an English stand-in.',
  },
];
