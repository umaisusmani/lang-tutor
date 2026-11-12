-- Turkish schema, consolidated from the final public schema after 0012_undo_review.sql.
-- Apply with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/tr/0001_schema.sql
-- German migrations remain in supabase/migrations/; Turkish migrations continue
-- in supabase/migrations/tr/. Auth users are shared, but application data is not.

begin;

create schema if not exists tr;

-- Match the existing public tables' Supabase privileges. RLS still controls rows.
grant usage on schema tr to anon, authenticated, service_role;
alter default privileges for role postgres in schema tr
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema tr
  grant all on sequences to anon, authenticated, service_role;

-- Every table in this exposed schema has RLS enabled. Policies use role targets
-- instead of auth.role(), wrap auth.uid() in a scalar SELECT, and pair UPDATE
-- USING with WITH CHECK. Policy-free tables are service-role-only by design.

create table tr.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  cefr_level  text        not null default 'A2'
                check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  created_at  timestamptz not null default now(),
  timezone    text        not null default 'UTC'
);

alter table tr.profiles enable row level security;

create policy "profiles_select_own" on tr.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_update_own" on tr.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- INSERT belongs to the signup trigger; DELETE follows auth.users by cascade.

create table tr.vocab_entries (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users (id) on delete cascade,
  term                 text        not null,
  lemma                text        not null,
  translation          text,
  example_sentence     text,
  source               text        not null check (source in ('new_word', 'mistake')),
  created_at           timestamptz not null default now(),
  note                 text,
  example_translation  text,
  unique (user_id, lemma)
);

alter table tr.vocab_entries enable row level security;

create policy "vocab_select_own" on tr.vocab_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vocab_insert_own" on tr.vocab_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "vocab_update_own" on tr.vocab_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "vocab_delete_own" on tr.vocab_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create table tr.mistake_history (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  mistake_type  text        not null check (mistake_type in (
                  'word_order', 'case_suffix', 'vowel_harmony',
                  'verb_conjugation', 'tense_aspect', 'postposition',
                  'possessive_suffix', 'buffer_consonant', 'plural_form',
                  'word_choice', 'other'
                )),
  user_input    text        not null,
  correction    text        not null,
  explanation   text        not null,
  created_at    timestamptz not null default now()
);

-- Keep this taxonomy in sync with mistakeTypes in lib/languages/tr.ts.
create index mistake_history_user_type_idx
  on tr.mistake_history (user_id, mistake_type);

alter table tr.mistake_history enable row level security;

create policy "mistakes_select_own" on tr.mistake_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "mistakes_insert_own" on tr.mistake_history
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "mistakes_delete_own" on tr.mistake_history
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Mistakes are historical records and have no UPDATE policy.

create table tr.personas (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,
  name        text        not null,
  age         integer,
  city        text,
  bio         text        not null,
  avatar_url  text,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now()
);

create unique index personas_one_default_idx
  on tr.personas (is_default) where is_default;

alter table tr.personas enable row level security;

create policy "personas_select_all" on tr.personas
  for select to anon, authenticated
  using (true);

-- Personas are content: clients can read, but only the service role edits.

create table tr.conversations (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  title       text,
  persona_id  uuid        references tr.personas (id) on delete set null
);

alter table tr.conversations enable row level security;

create policy "conversations_select_own" on tr.conversations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations_insert_own" on tr.conversations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own" on tr.conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create table tr.messages (
  id                   uuid        primary key default gen_random_uuid(),
  conversation_id      uuid        not null references tr.conversations (id) on delete cascade,
  role                 text        not null check (role in ('user', 'assistant')),
  content              text        not null,
  created_at           timestamptz not null default now(),
  correction           jsonb,
  gloss                jsonb,
  grammar_explanation  text
);

create index messages_conversation_created_idx
  on tr.messages (conversation_id, created_at);

alter table tr.messages enable row level security;

-- Messages inherit ownership from the parent conversation.
create policy "messages_select_own" on tr.messages
  for select to authenticated
  using (
    exists (
      select 1 from tr.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "messages_insert_own" on tr.messages
  for insert to authenticated
  with check (
    exists (
      select 1 from tr.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "messages_update_own" on tr.messages
  for update to authenticated
  using (
    exists (
      select 1 from tr.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from tr.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create table tr.session_usage (
  session_id        text        primary key,
  message_count     integer     not null default 0,
  first_message_at  timestamptz not null default now()
);

alter table tr.session_usage enable row level security;
-- Deliberately no policies: only the service role may touch the counter.

create table tr.token_usage (
  id                 uuid        primary key default gen_random_uuid(),
  occurred_at        timestamptz not null default now(),
  endpoint           text        not null
                       check (endpoint in ('chat', 'correction', 'gloss', 'explain', 'drill')),
  model              text        not null,
  prompt_tokens      integer,
  completion_tokens  integer,
  total_tokens       integer,
  user_id            uuid        references auth.users (id) on delete set null,
  session_id         text
);

create index token_usage_occurred_at_idx on tr.token_usage (occurred_at desc);

alter table tr.token_usage enable row level security;
-- Deliberately no policies: only the service role writes the usage log.

create table tr.cards (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  kind            text        not null check (kind in ('vocab_cloze', 'grammar_cloze')),
  vocab_entry_id  uuid        references tr.vocab_entries (id) on delete cascade,
  mistake_id      uuid        unique references tr.mistake_history (id) on delete cascade,
  cloze_text      text,
  answer          text,
  hint            text,
  wrong_form      text,
  state           smallint    not null default 0,
  due             timestamptz not null default now(),
  stability       float8      not null default 0,
  difficulty      float8      not null default 0,
  scheduled_days  integer     not null default 0,
  learning_steps  integer     not null default 0,
  reps            integer     not null default 0,
  lapses          integer     not null default 0,
  last_review     timestamptz,
  suspended       boolean     not null default false,
  created_at      timestamptz not null default now(),
  direction       text        not null default 'forward'
                    check (direction in ('forward', 'reverse')),
  check ((vocab_entry_id is null) <> (mistake_id is null)),
  constraint cards_vocab_entry_direction_key unique (vocab_entry_id, direction)
);

create index cards_user_due_idx on tr.cards (user_id, due) where not suspended;

alter table tr.cards enable row level security;

create policy "cards_select_own" on tr.cards
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "cards_insert_own" on tr.cards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "cards_update_own" on tr.cards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "cards_delete_own" on tr.cards
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create table tr.review_logs (
  id              uuid        primary key default gen_random_uuid(),
  card_id         uuid        not null references tr.cards (id) on delete cascade,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  rating          smallint    not null check (rating between 1 and 4),
  state           smallint    not null,
  due             timestamptz not null,
  stability       float8      not null,
  difficulty      float8      not null,
  scheduled_days  integer     not null,
  learning_steps  integer     not null,
  reviewed_at     timestamptz not null default now(),
  duration_ms     integer,
  surface         text        not null check (surface in ('panel', 'review_page')),
  answer_given    text
);

create index review_logs_user_time_idx on tr.review_logs (user_id, reviewed_at desc);
create index review_logs_card_idx on tr.review_logs (card_id);

alter table tr.review_logs enable row level security;

create policy "review_logs_select_own" on tr.review_logs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "review_logs_insert_own" on tr.review_logs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from tr.cards c
      where c.id = review_logs.card_id
        and c.user_id = (select auth.uid())
    )
  );

-- Review history has no UPDATE or DELETE policy.

create table tr.daily_usage (
  key            text    not null,
  day            date    not null,
  message_count  integer not null default 0,
  primary key (key, day)
);

alter table tr.daily_usage enable row level security;
-- Deliberately no policies: only the service role may change rate limits.

create table tr.note_categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);

create unique index note_categories_user_lower_name_idx
  on tr.note_categories (user_id, lower(name));

alter table tr.note_categories enable row level security;

create policy "note_categories_select_own" on tr.note_categories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "note_categories_insert_own" on tr.note_categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "note_categories_update_own" on tr.note_categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "note_categories_delete_own" on tr.note_categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create table tr.grammar_notes (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  note              text        not null,
  example_sentence  text,
  created_at        timestamptz not null default now(),
  category_id       uuid        references tr.note_categories (id) on delete set null
);

alter table tr.grammar_notes enable row level security;

create policy "grammar_notes_select_own" on tr.grammar_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "grammar_notes_insert_own" on tr.grammar_notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "grammar_notes_update_own" on tr.grammar_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "grammar_notes_delete_own" on tr.grammar_notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant all on all tables in schema tr to anon, authenticated, service_role;
grant all on all sequences in schema tr to anon, authenticated, service_role;

create function tr.consume_message(p_key text, p_cap integer, p_global_cap integer)
returns table (allowed boolean, reason text, remaining integer)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_day    date := (now() at time zone 'utc')::date;
  v_global integer;
  v_count  integer;
begin
  insert into tr.daily_usage as d (key, day, message_count)
  values ('global', v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < p_global_cap
  returning d.message_count into v_global;

  if v_global is null then
    return query select false, 'global'::text, 0;
    return;
  end if;

  insert into tr.daily_usage as d (key, day, message_count)
  values (p_key, v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < p_cap
  returning d.message_count into v_count;

  if v_count is null then
    update tr.daily_usage as d
      set message_count = d.message_count - 1
      where d.key = 'global' and d.day = v_day;
    return query select false, 'user'::text, 0;
    return;
  end if;

  return query select true, null::text, p_cap - v_count;
end;
$$;

create function tr.consume_translation(p_user_id uuid)
returns table (allowed boolean, reason text, remaining integer)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_global integer;
  v_count integer;
  v_key text := 'translate:user:' || p_user_id::text;
begin
  if p_user_id is null then
    return query select false, 'user'::text, 0;
    return;
  end if;

  insert into tr.daily_usage as d (key, day, message_count)
  values ('translate:global', v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < 300
  returning d.message_count into v_global;

  if v_global is null then
    return query select false, 'global'::text, 0;
    return;
  end if;

  insert into tr.daily_usage as d (key, day, message_count)
  values (v_key, v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < 50
  returning d.message_count into v_count;

  if v_count is null then
    update tr.daily_usage as d
      set message_count = d.message_count - 1
      where d.key = 'translate:global' and d.day = v_day;
    return query select false, 'user'::text, 0;
    return;
  end if;

  return query select true, null::text, 50 - v_count;
end;
$$;

create function tr.create_vocab_card()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into tr.cards (user_id, kind, vocab_entry_id, direction)
  values (new.user_id, 'vocab_cloze', new.id, 'forward'),
         (new.user_id, 'vocab_cloze', new.id, 'reverse');
  return new;
end;
$$;

create trigger on_vocab_entry_created
  after insert on tr.vocab_entries
  for each row execute function tr.create_vocab_card();

create function tr.record_review(
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
  update tr.cards set
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

  insert into tr.review_logs (
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

create function tr.undo_review(p_card_id uuid, p_expected_reps integer, p_previous_due timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card tr.cards%rowtype;
  v_log tr.review_logs%rowtype;
  v_previous_review timestamptz;
  v_restored tr.cards%rowtype;
begin
  if p_previous_due is null then
    return null;
  end if;

  select * into v_card
  from tr.cards
  where id = p_card_id and user_id = (select auth.uid())
  for update;

  if not found or v_card.reps <> p_expected_reps or v_card.reps <= 0 then
    return null;
  end if;

  select * into v_log
  from tr.review_logs
  where card_id = p_card_id and user_id = (select auth.uid())
  order by reviewed_at desc, id desc
  limit 1;

  if not found then
    return null;
  end if;

  select reviewed_at into v_previous_review
  from tr.review_logs
  where card_id = p_card_id and user_id = (select auth.uid()) and id <> v_log.id
  order by reviewed_at desc, id desc
  limit 1;

  update tr.cards set
    state = v_log.state,
    -- ts-fsrs logs the previous review time in due for reviewed cards.
    -- Restore the caller's snapshot because the log lacks the old due date.
    due = p_previous_due,
    stability = v_log.stability,
    difficulty = v_log.difficulty,
    scheduled_days = v_log.scheduled_days,
    learning_steps = v_log.learning_steps,
    reps = v_card.reps - 1,
    lapses = v_card.lapses - case when v_log.rating = 1 and v_log.state = 2 then 1 else 0 end,
    last_review = v_previous_review
  where id = p_card_id
  returning * into v_restored;

  delete from tr.review_logs where id = v_log.id;

  return jsonb_build_object(
    'state', v_restored.state,
    'due', v_restored.due,
    'stability', v_restored.stability,
    'difficulty', v_restored.difficulty,
    'scheduled_days', v_restored.scheduled_days,
    'learning_steps', v_restored.learning_steps,
    'reps', v_restored.reps,
    'lapses', v_restored.lapses,
    'last_review', v_restored.last_review
  );
end;
$$;

-- A Turkish profile must never break a signup for the shared auth.users table.
-- Ignore duplicate rows and swallow every insert error before returning NEW.
create function tr.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  begin
    insert into tr.profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'Could not create Turkish profile for auth user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Match public's effective function grants, then apply its explicit restrictions.
grant execute on all functions in schema tr to anon, authenticated, service_role;

revoke execute on function tr.consume_message(text, integer, integer)
  from public, anon, authenticated;

revoke execute on function tr.consume_translation(uuid)
  from public, anon, authenticated;
grant execute on function tr.consume_translation(uuid) to service_role;

revoke execute on function tr.record_review(uuid, integer, jsonb, jsonb)
  from public, anon;
grant execute on function tr.record_review(uuid, integer, jsonb, jsonb) to authenticated;

revoke execute on function tr.undo_review(uuid, integer, timestamptz)
  from public, anon;
grant execute on function tr.undo_review(uuid, integer, timestamptz) to authenticated;

create trigger on_auth_user_created_tr
  after insert on auth.users
  for each row execute function tr.handle_new_user();

-- Existing auth users predate the Turkish signup trigger.
insert into tr.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- lib/languages/tr.ts fallbackPersona mirrors this seeded row.
insert into tr.personas (slug, name, age, city, bio, avatar_url, is_default)
values (
  'ramya',
  'Ramya',
  25,
  'İstanbul',
  'Warm, quick to laugh, and a talker once she gets going. Studies '
    || 'architecture and works three evenings a week at a small coffee place '
    || 'in Kadıköy, a short walk from the Moda shore. Loves the ferry over to '
    || 'the European side, second-hand bookshops, cooking for more people than '
    || 'were invited, and walks that end at a çay garden. Lives with her older '
    || 'sister and their cat Zeytin. Curious about everyone she meets and '
    || 'happy to share small stories from her own week. Keeps a sketchbook of '
    || 'İstanbul doorways and sells prints of them online.',
  null,
  true
);

commit;
