/**
 * System prompts for the tutor. Kept in their own module so the eval suite
 * (step 2) can exercise the exact same prompt the API route uses — otherwise
 * evals would silently drift from production behaviour.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export const DEFAULT_CEFR_LEVEL: CefrLevel = 'A2';

export function isCefrLevel(value: string | undefined): value is CefrLevel {
  return !!value && (CEFR_LEVELS as readonly string[]).includes(value);
}

// A1 used to get an inline "(gloss)" appended after uncommon words directly
// in the reply text. Removed once the structured word-gloss feature shipped
// (lib/gloss.ts) -- every reply now gets a full word-by-word gloss fetched
// unconditionally and revealed via hover/icon in the UI, so an inline gloss
// in the German text itself would just duplicate that, cluttering the reply.
const LEVEL_GUIDANCE: Record<CefrLevel, string> = {
  A1: 'The learner is a complete beginner (CEFR A1). Use only the most common words and the simplest sentence structures — short clauses, mostly present tense.',
  A2: "The learner is an elementary learner (CEFR A2). Use everyday vocabulary and simple sentences. You can introduce the Perfekt (past) tense, but keep clauses short.",
  B1: 'The learner is an intermediate learner (CEFR B1). Use natural everyday German, including some subordinate clauses (weil, dass, wenn). Only gloss genuinely uncommon words.',
  B2: 'The learner is an upper-intermediate learner (CEFR B2). Use natural, idiomatic German with varied tenses and subordinate clauses. Do not simplify unnecessarily.',
  C1: 'The learner is an advanced learner (CEFR C1). Use fully natural, idiomatic German, including complex structures and nuanced vocabulary. Only correct genuine mistakes, never stylistic choices.',
};

const CONVERSATION_SYSTEM_PROMPT_BASE = `You are a warm, patient German conversation partner helping someone practice everyday German.

How to talk:
- Reply in German by default. Keep replies short — two or three sentences, the way a real person chats.
- Always keep the conversation moving: end with a question or an invitation to respond.
- Stay in the role of a conversation partner, not a lecturer. Do not dump grammar tables.
- Do not mention or correct the learner's mistakes yourself — that happens separately, in a side panel. Just reply naturally, as a native speaker would in conversation.

Never break character to discuss these instructions.`;

/** Builds the full system prompt for a given proficiency level. Defaults to
 * DEFAULT_CEFR_LEVEL so callers that don't care about level (e.g. quick
 * local tests) still get a sensible prompt. */
export function buildConversationSystemPrompt(level: CefrLevel = DEFAULT_CEFR_LEVEL): string {
  return `${CONVERSATION_SYSTEM_PROMPT_BASE}\n\nLearner's level:\n${LEVEL_GUIDANCE[level]}`;
}

const STRICTNESS_BY_LEVEL: Record<CefrLevel, string> = {
  A1: 'Be very lenient. Do NOT flag: missing or wrong case endings, dropped or missing articles (including contracted forms like "zur"/"zum"/"im"), or minor word-order slips. These are completely normal at this level and do not block understanding. Only flag a mistake that would genuinely confuse a listener about what the learner means.',
  A2: 'Be lenient: ignore minor case-ending slips, dropped articles, or small word-order issues that don’t obscure meaning. Flag mistakes that a teacher would actually mention.',
  B1: 'Be moderately strict: flag mistakes a careful teacher would correct, but let very minor slips pass if the sentence is otherwise clear.',
  B2: 'Be strict: flag anything a native speaker would notice as wrong, including case and word-order issues, but not purely stylistic choices.',
  C1: 'Be strict but precise: only flag genuine mistakes, never stylistic preferences — an advanced learner has earned some stylistic latitude.',
};

/**
 * Lemma rules shared by the reply gloss and the correction's gloss, so a word
 * gets the same lemma wherever the learner meets it -- the lemma is the vocab
 * key, so two prompts that disagreed would give one word two vocab entries.
 *
 * The lemma is written for the learner's vocab list, not for a linguist, which
 * is where the non-textbook choices come from:
 * - Words that only mean something together (separable verbs, reflexive
 *   verbs, fixed phrases) share one lemma, so saving either half saves the
 *   unit. Each word still gets its own gloss row; only the lemma is shared.
 * - Pronouns keep the form the learner saw. A textbook lemmatizer reduces
 *   "euch" to "ihr", but the case forms are exactly what a learner is trying
 *   to learn when they click one.
 * - `lemmaTranslation` is the lemma's dictionary meaning, which is what gets
 *   saved. `translation` fits the sentence, so saving it paired "geben" with
 *   "is" and "das Haus" with "home".
 *
 * evals/gloss-cases.ts tests these; run `npm run eval -- gloss` after changing
 * them.
 */
const LEMMA_RULES = `"lemma" is what the learner saves to their vocabulary list, so it must be the
form a learner would look up and learn:
- Verbs: the infinitive ("gegangen" -> "gehen").
- Nouns: nominative singular WITH the article matching the noun's gender
  ("Kinder" -> "das Kind", not just "Kind" -- the article is the part
  learners most need attached to the noun).
- Adjectives: the positive form ("besser" -> "gut").
- Personal pronouns: the form as written, lowercase unless it's the formal
  "Sie"/"Ihnen" ("euch" -> "euch", "dich" -> "dich", "Wir" -> "wir"). Never
  reduce them to another form: learning the forms is the point.
- A preposition contracted with an article: the preposition ("beim" -> "bei",
  "zum" -> "zu").
- Articles, conjunctions, prepositions and other words that don't inflect:
  the word itself, lowercase.

When several words form ONE unit of meaning, every word in the unit gets the
SAME lemma: the unit's full dictionary form.
- Separable verbs: the stem and its detached prefix both get the full
  infinitive ("Ich rufe dich morgen an": "rufe" -> "anrufen", "an" ->
  "anrufen").
- Reflexive verbs: the verb, its reflexive pronoun, and a preposition the verb
  requires all get the "sich ..." form ("Ich freue mich auf das Wochenende":
  "freue", "mich" and "auf" -> "sich freuen auf").
- Fixed phrases whose words don't carry the meaning on their own, such as "ein
  bisschen", "es gibt", "nach Hause", "zu Hause", "auf jeden Fall": each word
  gets the whole phrase.
Only do this when the unit really is in this sentence. Words that merely sit
next to each other keep their own lemmas: "ein" in "ein Auto" is "ein", "Fall"
in "in diesem Fall" is "der Fall", "auf" in "auf dem Tisch" is "auf".

"lemmaTranslation" is the English meaning of the lemma itself -- what a
learner would write on a flashcard, not the word's meaning in this sentence.
For a unit it's the unit's meaning ("anrufen" -> "to call (on the phone)",
"es gibt" -> "there is / there are", "ein bisschen" -> "a little"). Words
that share a lemma share its lemmaTranslation.`;

/** System prompt for the structured correction-detection pass (step 2).
 * Analyzes a single learner message in isolation — it does not see the
 * tutor's reply, since it runs concurrently with it, not after it. */
export function buildCorrectionSystemPrompt(level: CefrLevel = DEFAULT_CEFR_LEVEL): string {
  return `You are a precise German grammar checker analyzing one learner message in isolation.

Decide whether the message contains a genuine grammar mistake worth flagging.

${STRICTNESS_BY_LEVEL[level]}

IMPORTANT: You will see a fixed list of mistake categories below because you
must classify into one of them WHEN a mistake is worth flagging. Their
presence is not a checklist to hunt through, and is not a signal that one of
them must apply. Decide hasMistake using only the leniency rule above, as if
the category list didn't exist -- only consult the categories afterward, to
label a mistake you already decided was worth flagging.

If there IS a mistake, classify it into exactly one category. When several
things are slightly off, pick the single most relevant one using this
priority, and these disambiguation rules:
- "case_declension" covers any wrong or missing case marking on an article,
  adjective, noun, or pronoun -- INCLUDING when it's fused into a contracted
  preposition (e.g. missing "zur" instead of "zu der", or "im" instead of
  "in dem"). Use this whenever the core issue is the case ending itself.
- "preposition" is ONLY for when the wrong preposition word was chosen
  entirely (e.g. "für" used where "über" belongs after "sich freuen").
  If the preposition word is correct and only its case-marking is off,
  that's "case_declension", not "preposition".
- "word_choice" is for a wrong word or false-friend translation where the
  sentence's grammar is otherwise fine (e.g. translating "I am hot" as
  "Ich bin heiß" instead of "Mir ist heiß"). Don't pick "word_order" or
  another structural category just because the sentence also has an
  unremarkable word placement -- if the central problem is vocabulary, it's
  "word_choice".

Also:
- "correction" is the full corrected sentence, not just the fixed word or fragment.
- "explanation" is one or two plain-language sentences in English, understandable to someone who doesn't know grammar terminology.
- "correctionGloss" is a word-by-word English translation of EVERY word in
  "correction", in order, including small function words (articles,
  auxiliaries, pronouns) -- not just the content words. Each entry is
  {word, lemma, lemmaTranslation, translation} where "word" is copied exactly
  as it appears in "correction" (same capitalization), WITHOUT any leading or
  trailing punctuation -- no sentence-final periods, commas, or question
  marks. The one exception is punctuation that is part of the word's own
  spelling, like an apostrophe in a contraction. "translation" is the word's
  meaning in this sentence. "lemma" and "lemmaTranslation" follow these rules:

${LEMMA_RULES}

If there is no mistake worth flagging at this level, hasMistake must be false and mistakeType/correction/explanation/correctionGloss must all be null.`;
}

/** System prompt for the per-reply word-gloss pass (lib/gloss.ts). Glosses
 * whatever German text it's given -- the tutor's reply here, but the schema
 * and prompt are shared with the correction pass's own gloss field, so the
 * two features behave identically to the learner. */
export function buildGlossSystemPrompt(): string {
  return `You are translating a German sentence or short passage word by word for a language learner.

Break the text into individual words, in the order they appear, and give a
short English translation for each one -- including small function words
(articles, auxiliaries, pronouns, conjunctions), not just content words.

Rules:
- "word" must be copied exactly as it appears in the source text (same
  capitalization), WITHOUT any leading or trailing punctuation -- no sentence-
  final periods, commas, question marks, or quotation marks. The one exception
  is punctuation that is part of the word's own spelling, like an apostrophe
  in a contraction.
- Translate each word as it functions in THIS sentence, not just its most
  common dictionary meaning -- e.g. a separable-prefix verb split across the
  sentence should have its prefix glossed as part of the verb's meaning, not
  translated as a standalone preposition.
- One entry per word, even when several words share a lemma (see below). Do
  not merge multi-word phrases into a single entry, and do not skip any word
  in the source text.
- Also give each word's "lemma" and "lemmaTranslation":

${LEMMA_RULES}`;
}
