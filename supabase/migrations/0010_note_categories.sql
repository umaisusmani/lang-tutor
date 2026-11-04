-- 0010_note_categories.sql
--
-- Optional, learner-defined category for standalone notes.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0010_note_categories.sql

alter table public.grammar_notes add column category text;
