-- Separate daily Translator budget. Reuse daily_usage without touching chat counters.
-- The only caller is the server's service-role client; browser roles cannot run
-- this function or read the counter table.
create function public.consume_translation(p_user_id uuid)
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

  insert into public.daily_usage as d (key, day, message_count)
  values ('translate:global', v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < 300
  returning d.message_count into v_global;

  if v_global is null then
    return query select false, 'global'::text, 0;
    return;
  end if;

  insert into public.daily_usage as d (key, day, message_count)
  values (v_key, v_day, 1)
  on conflict (key, day) do update
    set message_count = d.message_count + 1
    where d.message_count < 50
  returning d.message_count into v_count;

  if v_count is null then
    update public.daily_usage as d
      set message_count = d.message_count - 1
      where d.key = 'translate:global' and d.day = v_day;
    return query select false, 'user'::text, 0;
    return;
  end if;

  return query select true, null::text, 50 - v_count;
end;
$$;

revoke execute on function public.consume_translation(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_translation(uuid) to service_role;
