/**
 * The mistake-type taxonomy. Single source of truth — referenced by the
 * correction schema (this step), the `mistake_history` DB column (step 3),
 * and the Pinecone grammar-corpus tags (step 5). If these drift apart,
 * retrieval-by-mistake-type silently returns nothing, so any new category
 * belongs here first, not invented ad hoc somewhere downstream.
 */

export const MISTAKE_TYPES = [
  'word_order', // Wortstellung — verb position, subordinate clause order
  'case_declension', // Kasus — wrong case ending on an article/adjective/pronoun
  'gender_article', // Genus — wrong grammatical gender (der/die/das)
  'verb_conjugation', // wrong personal ending on the main verb
  'auxiliary_verb', // wrong haben/sein choice in compound tenses
  'preposition', // wrong preposition, or right preposition/wrong case
  'adjective_ending', // wrong adjective ending within a noun phrase
  'plural_form', // wrong noun plural
  'word_choice', // wrong word, false friend, or register mismatch
  'other', // anything genuinely outside the above
] as const;

export type MistakeType = (typeof MISTAKE_TYPES)[number];

export function isMistakeType(value: string | undefined | null): value is MistakeType {
  return !!value && (MISTAKE_TYPES as readonly string[]).includes(value);
}
