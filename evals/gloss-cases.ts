export interface GlossEvalCase {
  id: string;
  input: string;
  /**
   * Word (exactly as it appears in `input`) -> the lemma it must get. Only
   * the words that are the point of the case are listed, so a case doesn't
   * fail because the model worded an unrelated translation differently. An
   * array means any of those lemmas is accepted.
   *
   * Compared case-insensitively with whitespace collapsed -- a lemma's
   * capitalization isn't what these cases test.
   */
  expectLemmas: Record<string, string | string[]>;
  note: string;
}

/**
 * Lemma cases for lib/gloss.ts's glossText(). The lemma is what a saved word
 * is keyed on, so these test "what would land in the learner's vocab list"
 * for the constructions where word-by-word lemmatization goes wrong:
 * separable verbs, reflexive verbs, fixed phrases -- plus controls that
 * catch the opposite failure, merging ordinary words into a phrase.
 *
 * The runner calls each case several times: the model's output varies, and
 * a word that gets a different lemma on different runs is a word whose ✓
 * flickers and whose vocab entry gets duplicated.
 */
export const GLOSS_EVAL_CASES: GlossEvalCase[] = [
  // --- Separable verbs: both halves share the full infinitive ---
  {
    id: 'separable-anrufen',
    input: 'Ich rufe dich morgen an.',
    expectLemmas: { rufe: 'anrufen', an: 'anrufen' },
    note: 'The prefix sits at the end of the clause; "rufen" alone is a different verb.',
  },
  {
    id: 'separable-mitkommen',
    input: 'Kommst du heute Abend mit?',
    expectLemmas: { Kommst: 'mitkommen', mit: 'mitkommen' },
    note: 'Question form: the stem moves to the front, the prefix still ends the clause.',
  },
  {
    id: 'separable-aufstehen',
    input: 'Ich stehe jeden Tag früh auf.',
    expectLemmas: { stehe: 'aufstehen', auf: 'aufstehen' },
    note: '"auf" here is not the preposition "on".',
  },

  // --- Reflexive verbs: the reflexive pronoun and required preposition belong to the verb ---
  {
    id: 'reflexive-freuen-auf',
    input: 'Ich freue mich auf das Wochenende.',
    expectLemmas: { freue: 'sich freuen auf', mich: 'sich freuen auf', auf: 'sich freuen auf' },
    note: '"sich freuen auf" (look forward to) is learned as one unit with its preposition.',
  },
  {
    id: 'reflexive-interessieren-fuer',
    input: 'Er interessiert sich für Musik.',
    expectLemmas: {
      interessiert: 'sich interessieren für',
      sich: 'sich interessieren für',
      für: 'sich interessieren für',
    },
    note: 'Third person: the lemma is still the "sich ..." citation form.',
  },

  // --- Fixed phrases: the words don't carry the meaning on their own ---
  {
    id: 'phrase-ein-bisschen',
    input: 'Ich spreche ein bisschen Deutsch.',
    expectLemmas: { ein: 'ein bisschen', bisschen: 'ein bisschen' },
    note: '"ein" here isn\'t the article "a"; the pair means "a little".',
  },
  {
    id: 'phrase-es-gibt',
    input: 'Es gibt hier keinen Bäcker.',
    expectLemmas: { Es: 'es gibt', gibt: 'es gibt' },
    note: 'Saving "geben" = "is" would teach the wrong meaning of "geben".',
  },
  {
    id: 'phrase-nach-hause',
    input: 'Wir gehen jetzt nach Hause.',
    expectLemmas: { nach: 'nach Hause', Hause: 'nach Hause', Wir: 'wir' },
    note: '"Hause" only exists in these phrases. Also checks "Wir" isn\'t lemmatized to "ich".',
  },
  {
    id: 'phrase-auf-jeden-fall',
    input: 'Auf jeden Fall komme ich mit.',
    expectLemmas: {
      Auf: 'auf jeden Fall',
      jeden: 'auf jeden Fall',
      Fall: 'auf jeden Fall',
      komme: 'mitkommen',
      mit: 'mitkommen',
    },
    note: 'A fixed phrase and a separable verb in the same sentence.',
  },

  // --- Pronouns keep the form the learner saw ---
  {
    id: 'pronoun-euch',
    input: 'Wie ist das Wetter bei euch?',
    expectLemmas: { euch: 'euch', bei: 'bei' },
    note: 'The case forms (euch, dich, ihm) are what learners need to learn, so no reduction to "ihr".',
  },
  {
    id: 'pronoun-dich',
    input: 'Ich sehe dich morgen.',
    expectLemmas: { dich: 'dich', sehe: 'sehen' },
    note: 'Pronoun kept as written; ordinary verb still lemmatized.',
  },

  // --- Contractions ---
  {
    id: 'contraction-beim',
    input: 'Ich war gestern beim Arzt.',
    expectLemmas: { beim: 'bei', Arzt: 'der Arzt' },
    note: 'Preposition + article contraction saves as the preposition.',
  },

  // --- Controls: ordinary words must NOT be merged into a phrase ---
  {
    id: 'control-fall',
    input: 'In diesem Fall bleibe ich hier.',
    expectLemmas: { Fall: 'der Fall', bleibe: 'bleiben' },
    note: '"Fall" is an ordinary noun here, not part of "auf jeden Fall".',
  },
  {
    id: 'control-ein',
    input: 'Ich habe ein Auto.',
    expectLemmas: { ein: 'ein', Auto: 'das Auto' },
    note: 'Plain article: "ein" stays "ein", even though "ein bisschen" is a phrase.',
  },
  {
    id: 'control-auf-preposition',
    input: 'Das Buch liegt auf dem Tisch.',
    expectLemmas: { auf: 'auf', liegt: 'liegen' },
    note: 'A real preposition, not a separable prefix.',
  },
  {
    id: 'control-rufen',
    input: 'Ich rufe meinen Bruder.',
    expectLemmas: { rufe: 'rufen' },
    note: 'No prefix anywhere, so it really is "rufen".',
  },
  {
    id: 'control-noun-plural',
    input: 'Die Kinder spielen im Garten.',
    expectLemmas: { Kinder: 'das Kind', spielen: 'spielen' },
    note: 'Baseline: nouns get nominative singular with their article.',
  },
];
