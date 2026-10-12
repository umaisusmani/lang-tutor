-- 0006_reverse_cards.sql
--
-- A second card per saved word: English -> German (production), alongside the
-- existing German -> English (recognition). Design: plans/flashcards.md §13.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0006_reverse_cards.sql
--
-- Safe to apply before or after deploying the code: the app treats a card
-- with no `direction` as 'forward'.

alter table public.cards
  add column direction text not null default 'forward'
  check (direction in ('forward', 'reverse'));

-- 0005 made vocab_entry_id UNIQUE so a word couldn't get two cards. It may now
-- have exactly one per direction. (The constraint name is Postgres's default
-- for an inline UNIQUE.)
alter table public.cards drop constraint cards_vocab_entry_id_key;
alter table public.cards
  add constraint cards_vocab_entry_direction_key unique (vocab_entry_id, direction);

-- Saving a word now creates both cards.
create or replace function public.create_vocab_card()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.cards (user_id, kind, vocab_entry_id, direction)
  values (new.user_id, 'vocab_cloze', new.id, 'forward'),
         (new.user_id, 'vocab_cloze', new.id, 'reverse');
  return new;
end;
$$;

-- Backfill: a reverse card for every word that only has its forward card.
-- New cards are rationed by NEW_PER_DAY, so this doesn't create a backlog.
insert into public.cards (user_id, kind, vocab_entry_id, direction)
select user_id, 'vocab_cloze', vocab_entry_id, 'reverse'
from public.cards
where vocab_entry_id is not null and direction = 'forward'
on conflict (vocab_entry_id, direction) do nothing;
