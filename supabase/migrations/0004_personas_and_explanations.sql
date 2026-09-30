-- 0004_personas_and_explanations.sql
--
-- Three additions:
--
--  1. `personas`: who the learner is talking to. One row for now (Ramanath),
--     but a table rather than a constant because more are planned, and a
--     conversation has to remember which one it was held with.
--  2. `conversations.persona_id`: that memory. Switching the default persona
--     later must not change who an existing chat was with.
--  3. `messages.grammar_explanation`: the on-demand "explain grammar" text,
--     stored so reopening it doesn't pay for a second LLM call.
--
-- Plus 'explain' as a token_usage endpoint, for that same call.

-- ---------------------------------------------------------------------------
-- personas
-- ---------------------------------------------------------------------------
create table if not exists public.personas (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,
  name        text        not null,
  age         integer,
  city        text,
  -- English, a few sentences: who they are, what they like, how they talk.
  -- Read by buildConversationSystemPrompt() in lib/prompts.ts, which turns it
  -- into instructions -- so this holds facts about the character, never
  -- prompt wording. Rewording the prompt then needs no migration.
  bio         text        not null,
  avatar_url  text,
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- At most one default: a partial unique index, since a plain UNIQUE on a
-- boolean would allow only one `false` row too.
create unique index if not exists personas_one_default_idx
  on public.personas (is_default) where is_default;

alter table public.personas enable row level security;

-- Readable by everyone, anonymous visitors included -- they chat with a
-- persona too. No INSERT/UPDATE/DELETE policies: personas are content, managed
-- through migrations or the dashboard (service role), never by users.
drop policy if exists "personas_select_all" on public.personas;
create policy "personas_select_all" on public.personas
  for select to anon, authenticated
  using (true);

insert into public.personas (slug, name, age, city, bio, avatar_url, is_default)
values (
  'ramanath',
  'Ramanath',
  24,
  'Düsseldorf',
  'Kind, warm and talkative. Studies media design and works weekend shifts in '
    || 'a café in Flingern. Loves walking along the Rhine, trying new recipes, '
    || 'indie music and cycling around the city. Has a younger brother and a '
    || 'slightly chaotic flatmate. Curious about other people and happy to '
    || 'share little stories from her own week.',
  null, -- no avatar art; the UI falls back to an initial badge
  true
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- conversations.persona_id
-- ---------------------------------------------------------------------------
-- Nullable with ON DELETE SET NULL: retiring a persona shouldn't delete the
-- chats held with it. The app falls back to the default persona on null.
alter table public.conversations
  add column if not exists persona_id uuid
    references public.personas (id) on delete set null;

-- Every chat so far was held with the only persona there was.
update public.conversations
  set persona_id = (select id from public.personas where is_default)
  where persona_id is null;

-- No policy change needed: conversations_insert_own checks user_id only, and
-- any persona is a valid choice.

-- ---------------------------------------------------------------------------
-- messages.grammar_explanation
-- ---------------------------------------------------------------------------
-- Lives on the row whose text it explains, same rule as correction/gloss in
-- 0003: explaining a reply -> the assistant row; explaining a correction ->
-- the user row (the correction is stored there). Written with the existing
-- messages_update_own policy.
alter table public.messages
  add column if not exists grammar_explanation text;

-- ---------------------------------------------------------------------------
-- token_usage.endpoint: + 'explain'
-- ---------------------------------------------------------------------------
alter table public.token_usage drop constraint token_usage_endpoint_check;

alter table public.token_usage
  add constraint token_usage_endpoint_check
  check (endpoint in ('chat', 'correction', 'gloss', 'explain'));
