-- 0012_undo_review.sql
--
-- Undo the latest flashcard rating and remove its review log atomically.
--
-- Applied with:
--   psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/0012_undo_review.sql
--
-- APPLY BEFORE deploying the code that calls undo_review.

-- review_logs has no client DELETE policy. This function therefore runs as
-- definer and checks ownership itself before touching either table.
create function public.undo_review(p_card_id uuid, p_expected_reps integer, p_previous_due timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.cards%rowtype;
  v_log public.review_logs%rowtype;
  v_previous_review timestamptz;
  v_restored public.cards%rowtype;
begin
  if p_previous_due is null then
    return null;
  end if;

  select * into v_card
  from public.cards
  where id = p_card_id and user_id = (select auth.uid())
  for update;

  if not found or v_card.reps <> p_expected_reps or v_card.reps <= 0 then
    return null;
  end if;

  select * into v_log
  from public.review_logs
  where card_id = p_card_id and user_id = (select auth.uid())
  order by reviewed_at desc, id desc
  limit 1;

  if not found then
    return null;
  end if;

  select reviewed_at into v_previous_review
  from public.review_logs
  where card_id = p_card_id and user_id = (select auth.uid()) and id <> v_log.id
  order by reviewed_at desc, id desc
  limit 1;

  update public.cards set
    state = v_log.state,
    -- ts-fsrs logs the previous review time in due for reviewed cards.
    -- The log does not keep the old due date, so restore the caller's snapshot of its own card.
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

  delete from public.review_logs where id = v_log.id;

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

revoke execute on function public.undo_review(uuid, integer, timestamptz) from public, anon;
grant execute on function public.undo_review(uuid, integer, timestamptz) to authenticated;
