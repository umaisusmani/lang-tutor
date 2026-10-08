import type { VocabEntry } from '@/lib/types/db';

/**
 * Turning a saved word into something to answer, and checking the answer.
 * Pure, no I/O, so both the review UI and the tests call it directly.
 * Design: plans/flashcards.md §6.
 */

/** One piece of a cloze sentence, in order. `blank` is where the answer goes;
 * `emphasis` marks the other half of a separable verb ("Ich ___ dich **an**"),
 * so the learner can see it's a separable-verb context. */
export type ClozeSegment = { text: string; blank?: true; emphasis?: true };

export type VocabPrompt =
  | {
      /** The word blanked in the sentence it was saved from. */
      kind: 'cloze';
      segments: ClozeSegment[];
      /** The form as it appears in the sentence -- inflection included, so
       * the learner has to produce "rufe", not "anrufen". */
      answer: string;
      /** The saved dictionary meaning ("to call"). */
      translation: string | null;
      /** The dictionary form, only when it doesn't give the answer away. */
      lemma: string | null;
    }
  | {
      /** No usable sentence: English meaning → German dictionary form.
       * Still trains gender, since a noun's lemma carries its article. */
      kind: 'recall';
      translation: string;
      answer: string;
    };

type ClozeSource = Pick<VocabEntry, 'term' | 'lemma' | 'translation' | 'example_sentence'>;

/**
 * Builds the card front for a saved word. Null when there's nothing to ask:
 * no sentence containing the word AND no translation to ask it from.
 */
export function buildVocabCloze(entry: ClozeSource): VocabPrompt | null {
  const sentence = entry.example_sentence?.trim();
  const match = sentence ? findWord(sentence, entry.term) : null;

  if (!sentence || !match) {
    if (!entry.translation) return null;
    return { kind: 'recall', translation: entry.translation, answer: entry.lemma };
  }

  const answer = sentence.slice(match.start, match.end);
  const segments: ClozeSegment[] = [];
  if (match.start > 0) segments.push({ text: sentence.slice(0, match.start) });
  segments.push({ text: answer, blank: true });
  segments.push(...emphasizeParticle(sentence.slice(match.end), entry.lemma, answer));

  return {
    kind: 'cloze',
    segments,
    answer,
    translation: entry.translation,
    // "das Kind" as a hint for "Kind" is the answer with an article on it.
    // Shown only when the dictionary form differs from what's being asked,
    // as it does for every inflected verb, adjective and plural.
    lemma: fold(bareLemma(entry.lemma)) === fold(answer) ? null : entry.lemma,
  };
}

/**
 * First whole-word, case-insensitive occurrence of `term` in the sentence.
 * Whole-word so "an" doesn't match inside "Mann"; Unicode-aware boundaries,
 * since \b treats "ü" as a non-word character.
 */
function findWord(sentence: string, term: string): { start: number; end: number } | null {
  const word = term.trim();
  if (!word) return null;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
  const m = re.exec(sentence);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * Splits the text after the blank, marking a separable-verb particle: a
 * later word that the lemma starts with ("an" in "anrufen" for "rufe ... an").
 * Only when the blanked form isn't itself the start of the lemma, so a plain
 * verb ("machen" for "macht") marks nothing. The last such word wins -- the
 * particle sits at the end of the clause.
 */
function emphasizeParticle(rest: string, lemma: string, answer: string): ClozeSegment[] {
  if (!rest) return [];
  const verb = bareLemma(lemma).toLowerCase();
  const tokens = rest.split(/(\s+)/);
  let particleAt = -1;

  if (!verb.startsWith(answer.toLowerCase())) {
    tokens.forEach((token, i) => {
      const core = token.replace(/[^\p{L}]/gu, '').toLowerCase();
      if (core.length >= 2 && core.length < verb.length && verb.startsWith(core)) particleAt = i;
    });
  }
  if (particleAt === -1) return [{ text: rest }];

  const token = tokens[particleAt];
  const core = token.match(/\p{L}+/u)!;
  const before = tokens.slice(0, particleAt).join('') + token.slice(0, core.index);
  const after = token.slice(core.index! + core[0].length) + tokens.slice(particleAt + 1).join('');
  return [
    ...(before ? [{ text: before }] : []),
    { text: core[0], emphasis: true as const },
    ...(after ? [{ text: after }] : []),
  ];
}

/** The lemma without the parts that aren't the word itself: a noun's article,
 * a reflexive "sich", a verb's trailing preposition ("sich freuen auf"). */
function bareLemma(lemma: string): string {
  const words = lemma.trim().split(/\s+/);
  const start = /^(der|die|das|sich)$/i.test(words[0] ?? '') ? 1 : 0;
  return words[start] ?? lemma;
}

export type AnswerCheck = {
  correct: boolean;
  /** Right word, but a capital letter where German needs one (or the
   * reverse). Still correct -- a gentle note, not a failed card. */
  capitalization?: true;
};

/**
 * Whether the typed answer matches. Correct maps to Good, wrong to Again;
 * the UI always offers an "I was right" override for typos and synonyms.
 *
 * Forgiving where keyboards are the problem, not the German:
 * - surrounding punctuation and extra spaces are ignored
 * - ae/oe/ue/ss count as ä/ö/ü/ß, for keyboards without them
 * - case is ignored, but a capitalization difference is reported, since
 *   noun capitalization is part of knowing a German noun
 */
export function checkAnswer(given: string, expected: string): AnswerCheck {
  const g = tidy(given);
  const e = tidy(expected);
  if (!g || fold(g) !== fold(e)) return { correct: false };

  const capitalOf = (s: string) => s[0] !== s[0].toLowerCase();
  return capitalOf(g) === capitalOf(e) ? { correct: true } : { correct: true, capitalization: true };
}

/** Trim, strip surrounding punctuation, collapse whitespace, normalize umlaut
 * encoding (a composed ü and u + combining diaeresis look identical). */
function tidy(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/\s+/g, ' ');
}

/** Case- and umlaut-insensitive comparison key. */
function fold(s: string): string {
  return tidy(s)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}
