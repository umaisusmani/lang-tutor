-- 0010_note_categories.sql
--
-- Managed categories for standalone grammar notes.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0010_note_categories.sql

-- Same RLS conventions as 0009 (TO authenticated, `(select auth.uid())`,
-- UPDATE policies pair USING with WITH CHECK).

create table public.note_categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);

create unique index note_categories_user_lower_name_idx
  on public.note_categories (user_id, lower(name));

alter table public.note_categories enable row level security;

create policy "note_categories_select_own" on public.note_categories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "note_categories_insert_own" on public.note_categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "note_categories_update_own" on public.note_categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "note_categories_delete_own" on public.note_categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.grammar_notes add column category_id uuid
  references public.note_categories (id) on delete set null;
