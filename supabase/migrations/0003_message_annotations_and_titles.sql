-- 0003_message_annotations_and_titles.sql
--
-- Two additions, both in service of reloading a conversation exactly as it
-- looked live:
--
--  1. Annotations on `messages`. Until now only `content` was stored, so a
--     restored turn came back stripped of its correction panel and word
--     gloss. Re-deriving those on load would mean replaying two LLM calls per
--     turn, which is both slow and billable -- so they get persisted instead.
--
--  2. A title on `conversations`, now that a user can have more than one and
--     needs to tell them apart in a list.

-- Which column a given annotation lands on follows what it describes, not
-- where it happens to render:
--   * `correction` is about what the LEARNER wrote, so it belongs on the user
--     message, even though the UI draws it under the reply that followed.
--     The full Correction object goes in, `correctionGloss` included.
--   * `gloss` is a word-by-word reading of the assistant's OWN text, so it
--     belongs on the assistant message.
-- app/page.tsx reassembles the pair for display.
alter table public.messages
  add column if not exists correction jsonb,
  add column if not exists gloss      jsonb;

-- JSONB rather than typed columns: these shapes are owned by the Zod schemas
-- in lib/tutor.ts and lib/gloss.ts, and mirroring them in DDL would mean a
-- migration every time a field is added there. Nothing queries inside them --
-- they're read back whole and handed to the client -- so there's no index to
-- lose by keeping them opaque.

alter table public.conversations
  add column if not exists title text;

-- Derived from the first user message when the conversation is created, so
-- the list has something to show. Nullable because a conversation exists
-- briefly before its first message lands.

-- ---------------------------------------------------------------------------
-- messages needs an UPDATE policy now
-- ---------------------------------------------------------------------------
-- The annotations arrive AFTER their message row is inserted: the user's text
-- is saved the moment it arrives, and the reply the moment it finishes
-- streaming -- both before the correction and gloss calls have resolved. So
-- writing them is an UPDATE, and messages had only SELECT and INSERT policies.
--
-- Without this the update is not an error: it silently matches zero rows, and
-- annotations would just never persist. USING and WITH CHECK are both required
-- -- USING alone would let a row be reassigned to another conversation.
drop policy if exists "messages_update_own" on public.messages;

create policy "messages_update_own" on public.messages
  for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );
