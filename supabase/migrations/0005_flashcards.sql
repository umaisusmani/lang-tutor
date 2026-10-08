-- 0005_flashcards.sql
--
-- Flashcards (FSRS spaced repetition), increment F1: the schedule store, the
-- review log, automatic cards for saved words, and the review-writing RPC.
-- Design: plans/flashcards.md §4.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0005_flashcards.sql
--
-- Same RLS conventions as 0001 (TO authenticated, `(select auth.uid())`,
-- UPDATE policies pair USING with WITH CHECK).

-- ---------------------------------------------------------------------------
-- cards: one review schedule per piece of content
-- ---------------------------------------------------------------------------
-- A schedule attached to data the app already stores, not a new content
-- type: a vocab card renders from its vocab_entries row at review time, so it
-- carries no text of its own. Grammar cards (F4) are generated once and keep
-- their text here, since the mistake row alone isn't a card.
create table public.cards (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  kind            text        not null check (kind in ('vocab_cloze', 'grammar_cloze')),
  vocab_entry_id  uuid        unique references public.vocab_entries (id) on delete cascade,
  mistake_id      uuid        unique references public.mistake_history (id) on delete cascade,

  -- Grammar cards only (F4).
  cloze_text      text,        -- corrected sentence with one '___'
  answer          text,        -- what fills the blank
  hint            text,        -- base form or rule label, e.g. "(der) — Dativ nach mit"
  wrong_form      text,        -- what the learner originally wrote, shown AFTER answering

  -- FSRS state: mirrors ts-fsrs's Card, minus elapsed_days (deprecated, and
  -- recomputed from last_review on every review anyway). Maths lives in
  -- lib/srs.ts; the database only stores the result.
  state           smallint    not null default 0,  -- 0 New, 1 Learning, 2 Review, 3 Relearning
  due             timestamptz not null default now(),
  stability       float8      not null default 0,
  difficulty      float8      not null default 0,
  scheduled_days  integer     not null default 0,
  learning_steps  integer     not null default 0,
  reps            integer     not null default 0,  -- doubles as the optimistic-lock version
  lapses          integer     not null default 0,
  last_review     timestamptz,

  suspended       boolean     not null default false,
  created_at      timestamptz not null default now(),

  -- Exactly one source. The UNIQUE on each FK is what stops a word (or a
  -- mistake) getting two cards; it also indexes the FK for the cascades.
  check ((vocab_entry_id is null) <> (mistake_id is null))
);

-- The queue query: "this user's unsuspended cards, soonest due first".
-- Partial, so suspended cards cost no index space.
create index cards_user_due_idx on public.cards (user_id, due) where not suspended;

alter table public.cards enable row level security;

create policy "cards_select_own" on public.cards
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "cards_insert_own" on public.cards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cards_update_own" on public.cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cards_delete_own" on public.cards
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- review_logs: append-only, one row per answer
-- ---------------------------------------------------------------------------
-- What FSRS's optimizer needs later, and how retention gets measured
-- (plans/flashcards.md §11). Field names follow ts-fsrs's ReviewLog.
create table public.review_logs (
  id              uuid        primary key default gen_random_uuid(),
  card_id         uuid        not null references public.cards (id) on delete cascade,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  rating          smallint    not null check (rating between 1 and 4),
  state           smallint    not null,   -- state BEFORE this review (FSRS convention)
  due             timestamptz not null,
  stability       float8      not null,
  difficulty      float8      not null,
  scheduled_days  integer     not null,
  learning_steps  integer     not null,
  reviewed_at     timestamptz not null default now(),
  duration_ms     integer,               -- time to answer
  surface         text        not null check (surface in ('panel', 'review_page')),
  answer_given    text                   -- what they typed; for debugging the answer checker
);

-- Serves both "my recent reviews" and "how many new cards did I start today"
-- (state = 0 since the start of the learner's day).
create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);
create index review_logs_card_idx on public.review_logs (card_id);

alter table public.review_logs enable row level security;

create policy "review_logs_select_own" on public.review_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Checks the CARD's owner too, not just user_id: without it, a direct insert
-- through the Data API could attach a log row to someone else's card id.
create policy "review_logs_insert_own" on public.review_logs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.cards c
      where c.id = review_logs.card_id
        and c.user_id = (select auth.uid())
    )
  );

-- No UPDATE or DELETE policy: like mistake_history, history isn't editable.

-- ---------------------------------------------------------------------------
-- profiles.timezone: the learner's day starts at 4am local time
-- ---------------------------------------------------------------------------
-- An IANA name ('Europe/Berlin'). Validated in lib/srs.ts, which falls back to
-- UTC for anything Intl doesn't recognise -- it never reaches SQL as code.
alter table public.profiles add column if not exists timezone text not null default 'UTC';

-- ---------------------------------------------------------------------------
-- token_usage.endpoint: + 'drill' (grammar-card generation, F4)
-- ---------------------------------------------------------------------------
-- Added now so F4 doesn't need a migration of its own just for this.
alter table public.token_usage drop constraint token_usage_endpoint_check;

alter table public.token_usage
  add constraint token_usage_endpoint_check
  check (endpoint in ('chat', 'correction', 'gloss', 'explain', 'drill'));

-- ---------------------------------------------------------------------------
-- Saving a word creates its card
-- ---------------------------------------------------------------------------
-- A trigger rather than app code: atomic with the save, no second round-trip,
-- and the vocab upsert's ON CONFLICT DO NOTHING path inserts no row, so a
-- re-save fires nothing and can't create a duplicate card.
--
-- SECURITY INVOKER (unlike handle_new_user's DEFINER): the user inserting
-- their own vocab row already passes cards_insert_own, so there is nothing to
-- bypass RLS for.
create function public.create_vocab_card()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.cards (user_id, kind, vocab_entry_id)
  values (new.user_id, 'vocab_cloze', new.id);
  return new;
end;
$$;

create trigger on_vocab_entry_created
  after insert on public.vocab_entries
  for each row execute function public.create_vocab_card();

-- Backfill: every word saved before this migration gets a New card. Due now,
-- but the queue's new-cards-per-day cap (lib/srs.ts) is what stops a backlog
-- of saved words turning into one enormous first session.
insert into public.cards (user_id, kind, vocab_entry_id)
select v.user_id, 'vocab_cloze', v.id
from public.vocab_entries v
on conflict (vocab_entry_id) do nothing;

-- ---------------------------------------------------------------------------
-- record_review: write a graded card and its log line together
-- ---------------------------------------------------------------------------
-- The scheduling maths runs in TypeScript (lib/srs.ts); this only writes the
-- result. One function so the card update and its log row are a single
-- transaction: both happen or neither does.
--
-- `p_expected_reps` is an optimistic lock. Two tabs can show the same card;
-- both read reps = N, both grade. The first write bumps reps to N+1, so the
-- second matches zero rows and returns false instead of silently overwriting
-- the first (a lost update). The caller reports that as "stale".
--
-- SECURITY INVOKER, so RLS applies: someone else's card id matches zero rows
-- in the UPDATE and returns false before any log row is written.
create function public.record_review(
  p_card_id uuid,
  p_expected_reps integer,
  p_card jsonb,
  p_log jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.cards set
    state          = (p_card->>'state')::smallint,
    due            = (p_card->>'due')::timestamptz,
    stability      = (p_card->>'stability')::float8,
    difficulty     = (p_card->>'difficulty')::float8,
    scheduled_days = (p_card->>'scheduled_days')::integer,
    learning_steps = (p_card->>'learning_steps')::integer,
    reps           = (p_card->>'reps')::integer,
    lapses         = (p_card->>'lapses')::integer,
    last_review    = (p_card->>'last_review')::timestamptz
  where id = p_card_id
    and reps = p_expected_reps;

  if not found then
    return false;
  end if;

  insert into public.review_logs (
    card_id, user_id, rating, state, due, stability, difficulty,
    scheduled_days, learning_steps, reviewed_at, duration_ms, surface, answer_given
  ) values (
    p_card_id,
    (select auth.uid()),
    (p_log->>'rating')::smallint,
    (p_log->>'state')::smallint,
    (p_log->>'due')::timestamptz,
    (p_log->>'stability')::float8,
    (p_log->>'difficulty')::float8,
    (p_log->>'scheduled_days')::integer,
    (p_log->>'learning_steps')::integer,
    (p_log->>'reviewed_at')::timestamptz,
    (p_log->>'duration_ms')::integer,
    p_log->>'surface',
    p_log->>'answer_given'
  );

  return true;
end;
$$;

-- Functions in `public` are executable by PUBLIC (including anon) by default.
-- RLS would already make an anonymous call a no-op, but there's no reason to
-- expose it at all.
revoke execute on function public.record_review(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.record_review(uuid, integer, jsonb, jsonb) to authenticated;
