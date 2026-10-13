-- 0007_daily_usage.sql
--
-- Hard daily message limits for everyone, plus a global kill switch.
--
-- Before this, only anonymous visitors were capped (5 messages, lifetime, per
-- cookie) and signed-in users were unlimited. `daily_usage` replaces the
-- `session_usage` counter with per-day buckets keyed by who is asking:
--
--   'user:<uuid>'    a signed-in account
--   'anon:<session>' an anonymous browser (cookie)
--   'global'         everyone together -- the budget backstop
--
-- Days roll over at 00:00 UTC. `session_usage` is left in place (unused) so
-- this migration is purely additive.

create table public.daily_usage (
  key            text    not null,
  day            date    not null,
  message_count  integer not null default 0,
  primary key (key, day)
);

alter table public.daily_usage enable row level security;
-- Intentionally zero policies, same as session_usage and token_usage: only the
-- service role (server-side) may touch it, so a client can't reset its own
-- counter.

-- ---------------------------------------------------------------------------
-- consume_message: one atomic "may this key send a message right now?"
-- ---------------------------------------------------------------------------
-- Takes the global slot first, then the caller's own. If the caller is over
-- their own cap, the global slot is handed back, so a capped-out user never
-- eats into the shared budget. Each step is a single
-- INSERT .. ON CONFLICT DO UPDATE .. WHERE count < cap, which Postgres
-- serialises per row -- two concurrent requests can't both take the last slot
-- (the old read-then-write version could overshoot by one).
create function public.consume_message(p_key text, p_cap integer, p_global_cap integer)
returns table (allowed boolean, reason text, remaining integer)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_day    date := (now() at time zone 'utc')::date;
  v_global integer;
  v_count  integer;
begin
  insert into public.daily_usage as d (key, day, message_count)
  values ('global', v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < p_global_cap
  returning d.message_count into v_global;

  if v_global is null then
    return query select false, 'global'::text, 0;
    return;
  end if;

  insert into public.daily_usage as d (key, day, message_count)
  values (p_key, v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < p_cap
  returning d.message_count into v_count;

  if v_count is null then
    update public.daily_usage as d
      set message_count = d.message_count - 1
      where d.key = 'global' and d.day = v_day;
    return query select false, 'user'::text, 0;
    return;
  end if;

  return query select true, null::text, p_cap - v_count;
end;
$$;

-- Callable only with the service role. security definer + the default PUBLIC
-- execute grant would otherwise let any browser call it through the REST API.
revoke execute on function public.consume_message(text, integer, integer)
  from public, anon, authenticated;
