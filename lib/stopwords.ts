/**
 * DEPRECATED -- nothing calls isStopword() any more. Kept, not deleted, so
 * the list can be revived without rebuilding it.
 *
 * Saving moved from a filtered row of chips under each reply to a + button on
 * every row of the gloss panel (see GlossPanel in app/chat.tsx). Once the
 * learner opens the panel and picks a word themselves, there is no list to
 * keep short and nothing to filter: offering "ist" costs one unread row, not
 * a chip crowding out the words worth saving. The filter only ever existed to
 * protect a display that no longer exists.
 *
 * Revive this if a surface that *suggests* words (rather than offering all of
 * them) comes back -- a daily review queue, say.
 *
 * ---
 *
 * Function words excluded from vocab-candidate suggestions.
 *
 * A learner sees "ich" and "ist" in every other sentence from day one --
 * offering them as "save this word?" chips is just noise that buries the
 * words actually worth saving. This is a plain lookup, not a model call:
 * deterministic, free, instant, can't hallucinate a stopword into existing.
 *
 * Lowercase only -- callers must lowercase the candidate lemma before
 * checking membership (see isStopword below).
 */
const GERMAN_STOPWORDS = new Set([
  // Personal pronouns
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'mich', 'dich', 'ihn', 'uns', 'euch',
  'mir', 'dir', 'ihm', 'ihnen',
  // Possessive pronouns/determiners (common forms)
  'mein', 'meine', 'meiner', 'meinen', 'meinem', 'meines',
  'dein', 'deine', 'deiner', 'deinen', 'deinem', 'deines',
  'sein', 'seine', 'seiner', 'seinen', 'seinem', 'seines',
  'ihre', 'ihrer', 'ihren', 'ihrem', 'ihres',
  'unser', 'unsere', 'unserer', 'unseren', 'unserem',
  // Definite/indefinite articles, all cases
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einer', 'einen', 'einem', 'eines',
  'kein', 'keine', 'keiner', 'keinen', 'keinem', 'keines',
  // Coordinating/subordinating conjunctions
  'und', 'oder', 'aber', 'sondern', 'denn', 'doch',
  'dass', 'weil', 'wenn', 'ob', 'als', 'obwohl', 'während',
  // High-frequency prepositions
  'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu',
  'für', 'gegen', 'ohne', 'um', 'durch', 'über', 'unter', 'vor', 'zwischen', 'neben',
  // Auxiliary/copula verbs, common conjugations
  'sein', 'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'waren', 'gewesen',
  'haben', 'habe', 'hast', 'hat', 'habt', 'hatte', 'hatten', 'gehabt',
  'werden', 'werde', 'wirst', 'wird', 'werdet', 'wurde', 'wurden', 'geworden',
  // Common modal verbs (learners hit these constantly, low candidate value)
  'können', 'kann', 'kannst', 'könnt', 'konnte',
  'müssen', 'muss', 'musst', 'müsst', 'musste',
  'wollen', 'will', 'willst', 'wollt', 'wollte',
  'sollen', 'soll', 'sollst', 'sollt', 'sollte',
  'dürfen', 'darf', 'darfst', 'dürft', 'durfte',
  // Basic adverbs/particles
  'nicht', 'auch', 'nur', 'noch', 'schon', 'sehr', 'so', 'ja', 'nein',
  'hier', 'da', 'dort', 'jetzt', 'dann', 'immer', 'nie',
  // Question words (function words, not content vocab)
  'wer', 'was', 'wie', 'wo', 'warum', 'wann', 'welche', 'welcher', 'welches',
]);

export function isStopword(lemma: string): boolean {
  return GERMAN_STOPWORDS.has(lemma.toLowerCase());
}
