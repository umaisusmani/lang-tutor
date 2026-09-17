/**
 * Row shapes for every table in supabase/migrations/0001_initial_schema.sql.
 *
 * Hand-written rather than generated: `supabase gen types typescript` needs
 * the Supabase CLI, which this project deliberately doesn't install (see
 * PLAN.md). Keep these in sync with the migration by hand -- if a column is
 * added there, add it here in the same change.
 *
 * Field names are snake_case because these mirror the database exactly; the
 * service layer is where they get translated into anything friendlier.
 */

import type { MistakeType } from '@/lib/mistake-types';
import type { CefrLevel } from '@/lib/prompts';

export type VocabSource = 'new_word' | 'mistake';
export type UsageEndpoint = 'chat' | 'correction' | 'gloss';
export type MessageRole = 'user' | 'assistant';

export interface Profile {
  user_id: string;
  cefr_level: CefrLevel;
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
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
}
