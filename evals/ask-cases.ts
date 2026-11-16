import type { CefrLevel } from '@/lib/prompts';

export interface AskEvalCase {
  id: string;
  level: CefrLevel;
  question: string;
  chatContext?: string;
  panelContext?: string;
  checks: { pattern: RegExp; why: string }[];
  rejects?: { pattern: RegExp; why: string }[];
  note: string;
}

/**
 * Ask regression set. Checks test that the answer contains the right facts
 * and avoids known-wrong claims. They don't test format or length — the
 * prompt is intentionally free-form. Printed answers still need a German
 * speaker's manual review.
 */
export const ASK_EVAL_CASES: AskEvalCase[] = [
  {
    id: 'german-auf-accusative',
    level: 'A2',
    question: 'Ich freue mich auf das Wochenende.',
    checks: [
      { pattern: /look(?:ing)? forward|weekend|wochenende/i, why: 'conveys the meaning' },
    ],
    rejects: [
      { pattern: /\bauf\b.*\bdative\b/i, why: 'auf + accusative here, not dative' },
    ],
    note: 'Previously the 20B model incorrectly labeled auf das Wochenende dative.',
  },
  {
    id: 'english-present-future-meaning',
    level: 'A2',
    question: 'I am going to the supermarket tomorrow.',
    checks: [
      { pattern: /ich gehe/i, why: 'includes the German translation' },
      { pattern: /supermarkt/i, why: 'translates supermarket' },
    ],
    rejects: [
      { pattern: /future tense|futur\s*(?:i|1)/i, why: 'ich gehe is present tense, even with morgen' },
    ],
    note: 'Previously the 20B model called ich gehe future tense.',
  },
  {
    id: 'question-mit-dative',
    level: 'A2',
    question: 'Why is it mit dem Mann instead of mit der Mann?',
    checks: [
      { pattern: /dative|dativ/i, why: 'identifies dative case' },
      { pattern: /\bdem\b/i, why: 'identifies the correct article' },
    ],
    note: 'Direct answer about mit + dative.',
  },
  {
    id: 'german-subordinate-clause',
    level: 'B1',
    question: "Why does 'arbeitet' come at the end of 'Ich weiß, dass er heute arbeitet'?",
    checks: [
      { pattern: /\bdass\b|subordinate/i, why: 'connects the rule to the dass clause' },
      { pattern: /\bend\b|\bfinal\b|\blast\b/i, why: 'identifies verb-final order' },
    ],
    note: 'Checks verb position after dass.',
  },
  {
    id: 'question-perfect-sein',
    level: 'A2',
    question: "Why is it 'bin gefahren' rather than 'habe gefahren' in 'Gestern bin ich nach Berlin gefahren'?",
    checks: [
      { pattern: /\bsein\b/i, why: 'recognizes sein auxiliary' },
      { pattern: /movement|motion|travel|destination|place|location/i, why: 'explains the motion-verb pattern' },
    ],
    rejects: [
      { pattern: /\bseparable\b/i, why: 'fahren is not a separable verb' },
    ],
    note: 'Checks a common Perfekt auxiliary trap.',
  },
  {
    id: 'english-hungry',
    level: 'A1',
    question: 'I am hungry.',
    checks: [
      { pattern: /ich habe hunger/i, why: 'includes the idiomatic German translation' },
    ],
    note: 'Checks the common idiom ich habe Hunger.',
  },
  {
    id: 'question-adjective-ending',
    level: 'A2',
    question: "What gender is 'Auto', and why is it 'ein rotes Auto' rather than 'ein rot Auto'?",
    checks: [
      { pattern: /neuter|neutrum|neutral/i, why: 'Auto is neuter' },
      { pattern: /adjective|ending|endung|rotes/i, why: 'explains adjective inflection' },
    ],
    rejects: [
      { pattern: /weak (?:ending|declension)/i, why: 'ein rotes Auto uses mixed, not weak, adjective inflection' },
    ],
    note: 'Short grammar question.',
  },
  {
    id: 'question-uses-chat-context',
    level: 'A1',
    question: "What does 'aus' mean here?",
    chatContext: 'Tutor: Ich komme aus Berlin.',
    checks: [
      { pattern: /from/i, why: 'uses the supplied phrase to interpret aus' },
    ],
    note: 'Ask should use recent chat for references.',
  },
];
