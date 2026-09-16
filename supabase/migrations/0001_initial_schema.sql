-- 0001_initial_schema.sql
--
-- Lang Tutor initial schema: profiles, vocab, mistake history, usage
-- tracking, and conversation storage.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0001_initial_schema.sql
--
-- RLS conventions used throughout (per Supabase's own security guidance):
--   * every table in `public` has RLS enabled -- tables here are reachable
--     through the Data API, so an unprotected one is publicly readable
--   * policies name their target role with `TO authenticated` rather than
--     checking auth.role(), which breaks silently if anonymous sign-ins are
--     ever enabled (anon users also carry the `authenticated` Postgres role)
--   * auth.uid() is wrapped as `(select auth.uid())` so Postgres evaluates it
--     once per query instead of once per row
--   * UPDATE policies always pair USING with WITH CHECK -- USING alone would
--     let a user edit their own row and reassign user_id to someone else
--   * tables with RLS enabled and zero policies are fully invisible to
--     clients by design; only the service role (which bypasses RLS) writes them

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in user, created automatically on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  cefr_level  text        not null default 'A2'
                check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  created_at  timestamptz not null default now()
);

-- No surrogate id: this is a genuine 1:1 with auth.users, so the user's own
-- id is the natural, permanent identity.

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deliberately no INSERT policy: rows are created only by the signup trigger
-- below (SECURITY DEFINER, so it bypasses RLS). Deliberately no DELETE policy:
-- profiles die with their auth.users row via ON DELETE CASCADE.

-- ---------------------------------------------------------------------------
-- vocab_entries: words a user has saved
-- ---------------------------------------------------------------------------
create table public.vocab_entries (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  term              text        not null,
  lemma             text        not null,
  translation       text,
  example_sentence  text,
  source            text        not null check (source in ('new_word', 'mistake')),
  created_at        timestamptz not null default now(),
  unique (user_id, lemma)
);

-- `term` is the inflected form as the learner actually wrote it ("gemacht");
-- `lemma` is the dictionary form ("machen") and is what candidate words are
-- matched against. The UNIQUE constraint both enforces "one entry per word per
-- user" and provides the index backing that lookup -- no separate index needed,
-- since a UNIQUE constraint is implemented as a unique btree index.

alter table public.vocab_entries enable row level security;

create policy "vocab_select_own" on public.vocab_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vocab_insert_own" on public.vocab_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "vocab_update_own" on public.vocab_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "vocab_delete_own" on public.vocab_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- mistake_history: corrections issued to signed-in users
-- ---------------------------------------------------------------------------
create table public.mistake_history (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  mistake_type  text        not null check (mistake_type in (
                  'word_order', 'case_declension', 'gender_article',
                  'verb_conjugation', 'auxiliary_verb', 'preposition',
                  'adjective_ending', 'plural_form', 'word_choice', 'other'
                )),
  user_input    text        not null,
  correction    text        not null,
  explanation   text        not null,
  created_at    timestamptz not null default now()
);

-- Kept in sync by hand with MISTAKE_TYPES in lib/mistake-types.ts. A CHECK
-- rather than a native enum: this taxonomy is the one most likely to grow, and
-- redefining a CHECK is a drop-and-recreate, whereas ALTER TYPE ... ADD VALUE
-- carries more friction.

-- Non-unique by design (a learner repeats the same mistake type constantly);
-- step 5 queries "this user's past mistakes of type X", hence the composite.
create index mistake_history_user_type_idx
  on public.mistake_history (user_id, mistake_type);

alter table public.mistake_history enable row level security;

create policy "mistakes_select_own" on public.mistake_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "mistakes_insert_own" on public.mistake_history
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "mistakes_delete_own" on public.mistake_history
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy: a historical record of what was written and corrected is
-- not something that should be editable after the fact.

-- ---------------------------------------------------------------------------
-- conversations / messages: chat history, feeding step 6's memory corpus
-- ---------------------------------------------------------------------------
create table public.conversations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.messages (
  id               uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        not null references public.conversations (id) on delete cascade,
  role             text        not null check (role in ('user', 'assistant')),
  content          text        not null,
  created_at       timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "conversations_select_own" on public.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own" on public.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- messages have no user_id of their own -- ownership is inherited from the
-- parent conversation, so every policy proves ownership through that join.
create policy "messages_select_own" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- session_usage: anonymous rate-limit counter (step 4)
-- ---------------------------------------------------------------------------
create table public.session_usage (
  session_id        text        primary key,
  message_count     integer     not null default 0,
  first_message_at  timestamptz not null default now()
);

-- Keyed by a cookie-derived id, not a user: by definition these are visitors
-- who are not signed in, so there is no auth.users row to reference.

alter table public.session_usage enable row level security;

-- Intentionally zero policies: RLS enabled with no policy means no client can
-- read or write this table under any session. The rate limiter runs
-- server-side with the service role key, which bypasses RLS. Letting a client
-- touch its own counter would defeat the point of the counter.

-- ---------------------------------------------------------------------------
-- token_usage: raw LLM consumption log (observability, not enforcement)
-- ---------------------------------------------------------------------------
create table public.token_usage (
  id                 uuid        primary key default gen_random_uuid(),
  occurred_at        timestamptz not null default now(),
  endpoint           text        not null check (endpoint in ('chat', 'correction')),
  model              text        not null,
  prompt_tokens      integer,
  completion_tokens  integer,
  total_tokens       integer,
  user_id            uuid        references auth.users (id) on delete set null,
  session_id         text
);

-- ON DELETE SET NULL, not CASCADE: this is a consumption log, and deleting a
-- user should anonymize their usage rows rather than erase the record that the
-- tokens were spent. session_id carries no FK -- anonymous sessions are just
-- cookie values, not rows in a table with referential integrity.

create index token_usage_occurred_at_idx on public.token_usage (occurred_at desc);

alter table public.token_usage enable row level security;

-- Also intentionally policy-free: server-side writes only, via service role.

-- ---------------------------------------------------------------------------
-- Signup trigger: every new auth.users row gets a profile
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id);
  return new;
end;
$$;

-- `security definer` is required here: the trigger runs during signup, before
-- any user session exists, so it must not be subject to profiles' RLS. The
-- empty search_path is the matching safety measure -- with no schema on the
-- path, every reference must be fully qualified, which prevents a malicious
-- object in a user-controlled schema from shadowing `profiles`.

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
