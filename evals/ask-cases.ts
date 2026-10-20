import type { CefrLevel } from '@/lib/prompts';

export interface AskEvalCase {
  id: string;
  level: CefrLevel;
  question: string;
  kind: 'german-phrase' | 'english-phrase' | 'question';
  chatContext?: string;
  panelContext?: string;
  checks: { part: 'first' | 'grammar' | 'whole'; pattern: RegExp; why: string }[];
  rejects?: { part: 'first' | 'grammar' | 'whole'; pattern: RegExp; why: string }[];
  note: string;
}

/**
 * Small, hand-curated Ask regression set. Checks catch known, unambiguous
 * mistakes; printed answers still need a German speaker's review. In
 * particular, passing these regexes does not prove every grammar claim true.
 */
export const ASK_EVAL_CASES: AskEvalCase[] = [
  {
    id: 'german-auf-accusative',
    level: 'A2',
    question: 'Ich freue mich auf das Wochenende.',
    kind: 'german-phrase',
    checks: [
      { part: 'first', pattern: /look(?:ing)? forward to the weekend/i, why: 'natural English translation' },
    ],
    rejects: [
      { part: 'grammar', pattern: /\bdative\b|\bdativ\b|\bnominative\b|\bnominativ\b/i, why: 'auf das Wochenende is accusative, not dative or nominative' },
    ],
    note: 'Previously the 20B model incorrectly labeled auf das Wochenende dative.',
  },
  {
    id: 'english-present-future-meaning',
    level: 'A2',
    question: 'I am going to the supermarket tomorrow.',
    kind: 'english-phrase',
    checks: [
      { part: 'first', pattern: /ich gehe morgen .*supermarkt/i, why: 'German translation, not English restatement' },
    ],
    rejects: [
      { part: 'grammar', pattern: /future tense|futur\s*(?:i|1)/i, why: 'ich gehe is present tense, even with morgen' },
    ],
    note: 'Previously the 20B model called ich gehe future tense.',
  },
  {
    id: 'question-mit-dative',
    level: 'A2',
    question: 'Why is it mit dem Mann instead of mit der Mann?',
    kind: 'question',
    checks: [
      { part: 'whole', pattern: /dative|dativ/i, why: 'identifies dative case' },
      { part: 'whole', pattern: /\bdem\b/i, why: 'identifies the correct article' },
    ],
    note: 'Direct answer; do not append an inaccurate article paradigm.',
  },
  {
    id: 'german-subordinate-clause',
    level: 'B1',
    question: "Why does 'arbeitet' come at the end of 'Ich weiß, dass er heute arbeitet'?",
    kind: 'question',
    checks: [
      { part: 'whole', pattern: /\bdass\b|subordinate/i, why: 'connects the rule to the dass clause' },
      { part: 'whole', pattern: /\bend\b|\bfinal\b|\blast\b/i, why: 'identifies verb-final order' },
    ],
    note: 'Checks verb position after dass.',
  },
  {
    id: 'question-perfect-sein',
    level: 'A2',
    question: "Why is it 'bin gefahren' rather than 'habe gefahren' in 'Gestern bin ich nach Berlin gefahren'?",
    kind: 'question',
    checks: [
      { part: 'whole', pattern: /\bbin\b|\bsein\b/i, why: 'recognizes sein auxiliary in bin gefahren' },
      { part: 'whole', pattern: /movement|motion|travel|destination|fahren/i, why: 'explains the motion-verb pattern' },
    ],
    rejects: [
      { part: 'whole', pattern: /\bseparable\b/i, why: 'fahren is not a separable verb' },
      { part: 'whole', pattern: /modal-like/i, why: 'fahren is not a modal-like verb' },
    ],
    note: 'Checks a common Perfekt auxiliary trap.',
  },
  {
    id: 'english-hungry',
    level: 'A1',
    question: 'I am hungry.',
    kind: 'english-phrase',
    checks: [
      { part: 'first', pattern: /ich habe hunger/i, why: 'idiomatic German translation' },
    ],
    rejects: [
      { part: 'grammar', pattern: /\bhunger\b.*\bnominative\b/i, why: 'Hunger is the accusative object of habe here' },
    ],
    note: 'Checks the common idiom ich habe Hunger; ich bin hungrig is also grammatical.',
  },
  {
    id: 'question-adjective-ending',
    level: 'A2',
    question: "What gender is 'Auto', and why is it 'ein rotes Auto' rather than 'ein rot Auto'?",
    kind: 'question',
    checks: [
      { part: 'whole', pattern: /neuter|neutrum|neutral/i, why: 'Auto is neuter' },
      { part: 'whole', pattern: /adjective|ending|endung|rotes/i, why: 'explains adjective inflection' },
    ],
    rejects: [
      { part: 'whole', pattern: /weak (?:ending|declension)/i, why: 'ein rotes Auto uses mixed, not weak, adjective inflection' },
    ],
    note: 'Short grammar question rather than a pasted-sentence translation.',
  },
  {
    id: 'question-uses-chat-context',
    level: 'A1',
    question: "What does 'aus' mean here?",
    chatContext: 'Tutor: Ich komme aus Berlin.',
    kind: 'question',
    checks: [
      { part: 'whole', pattern: /from/i, why: 'uses the supplied phrase to interpret aus' },
    ],
    note: 'Ask may use recent chat for references without continuing the roleplay.',
  },
];
