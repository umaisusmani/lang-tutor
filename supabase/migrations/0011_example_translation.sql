-- 0011_example_translation.sql
--
-- English translation of a saved word's example sentence, shown on the
-- flashcard after the answer is revealed. Nullable with no backfill: words
-- saved before this (or from a chat reply, where only the German sentence is
-- known) simply show no translation.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0011_example_translation.sql
--
-- APPLY BEFORE deploying the code that reads/writes this column.

alter table public.vocab_entries
  add column if not exists example_translation text;
