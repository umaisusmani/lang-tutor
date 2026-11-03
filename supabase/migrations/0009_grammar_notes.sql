-- 0009_grammar_notes.sql
--
-- Standalone saved grammar explanations and personal notes on vocab words.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0009_grammar_notes.sql
--
-- Same RLS conventions as 0001 (TO authenticated, `(select auth.uid())`,
-- UPDATE policies pair USING with WITH CHECK).

create table public.grammar_notes (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  note              text        not null,
  example_sentence  text,
  created_at        timestamptz not null default now()
);

alter table public.grammar_notes enable row level security;

create policy "grammar_notes_select_own" on public.grammar_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "grammar_notes_insert_own" on public.grammar_notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "grammar_notes_update_own" on public.grammar_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "grammar_notes_delete_own" on public.grammar_notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Free-text personal note, separate from the word's translation.
alter table public.vocab_entries add column note text;
