/**
 * Row shapes for every table in supabase/migrations/0001_initial_schema.sql.
 *
 * Hand-written rather than generated: `supabase gen types typescript` needs
 * the Supabase CLI, which this project deliberately doesn't install (see
 * docs/TECHNICAL.md §6). Keep these in sync with the migration by hand -- if a column is
 * added there, add it here in the same change.
 *
 * Field names are snake_case because these mirror the database exactly; the
 * service layer is where they get translated into anything friendlier.
 */

import type { ReplyGloss, WordGloss } from '@/lib/gloss';
import type { MistakeType } from '@/lib/mistake-types';
import type { CefrLevel } from '@/lib/prompts';
import type { Correction } from '@/lib/tutor';

export type VocabSource = 'new_word' | 'mistake';
export type UsageEndpoint = 'chat' | 'correction' | 'gloss' | 'explain' | 'drill';
export type MessageRole = 'user' | 'assistant';

export interface Profile {
  user_id: string;
  cefr_level: CefrLevel;
  /** IANA name, for the 4am day rollover in the review queue (0005). */
  timezone: string;
  created_at: string;
}

export interface VocabEntry {
  id: string;
  user_id: string;
  term: string;
  lemma: string;
  translation: string | null;
  example_sentence: string | null;
  source: VocabSource;
  created_at: string;
}

export interface MistakeRecord {
  id: string;
  user_id: string;
  mistake_type: MistakeType;
  user_input: string;
  correction: string;
  explanation: string;
  created_at: string;
}

export interface TokenUsageRecord {
  id: string;
  occurred_at: string;
  endpoint: UsageEndpoint;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  user_id: string | null;
  session_id: string | null;
}

export interface SessionUsage {
  session_id: string;
  message_count: number;
  first_message_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  /** Derived from the first user message, so a list has something to show. */
  title: string | null;
  /** Who the chat was held with (0004). Null for a persona since removed --
   * readers fall back to the default persona. */
  persona_id: string | null;
  created_at: string;
}

export interface Persona {
  id: string;
  slug: string;
  name: string;
  age: number | null;
  city: string | null;
  /** Facts about the character, in English -- lib/prompts.ts turns them into
   * instructions. Not prompt text itself. */
  bio: string;
  avatar_url: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  /** Set on USER messages -- it describes what the learner wrote, even though
   * the UI renders it under the reply that followed. */
  correction: Correction | null;
  /** Set on ASSISTANT messages -- a reading of its own text. Stored as a bare
   * word array before the sentence translation existed; read it through
   * normalizeReplyGloss() in lib/gloss.ts, never directly. */
  gloss: ReplyGloss | WordGloss | null;
  /** The on-demand "explain grammar" text for this row's own text: the reply
   * on an assistant row, the correction on a user row. */
  grammar_explanation: string | null;
}

export type CardKind = 'vocab_cloze' | 'grammar_cloze';
/** ts-fsrs's State enum, stored as a smallint. */
export type CardState = 0 | 1 | 2 | 3;
export type ReviewSurface = 'panel' | 'review_page';

/** The FSRS fields of a card -- what lib/srs.ts reads and writes. */
export interface CardSchedule {
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  /** Also the optimistic-lock version record_review checks. */
  reps: number;
  lapses: number;
  last_review: string | null;
}

export interface Card extends CardSchedule {
  id: string;
  user_id: string;
  kind: CardKind;
  /** Exactly one of these two is set (a CHECK enforces it). */
  vocab_entry_id: string | null;
  mistake_id: string | null;
  /** Grammar cards only (F4); null on vocab cards, which render from their
   * vocab_entries row. */
  cloze_text: string | null;
  answer: string | null;
  hint: string | null;
  wrong_form: string | null;
  suspended: boolean;
  created_at: string;
}

export interface ReviewLog {
  id: string;
  card_id: string;
  user_id: string;
  rating: 1 | 2 | 3 | 4;
  /** The card's state BEFORE this review (FSRS convention). */
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reviewed_at: string;
  duration_ms: number | null;
  surface: ReviewSurface;
  answer_given: string | null;
}
