-- Keep the existing hourly/daily budgets, per-game cooldowns, RLS and grants.
alter table public.meta_fetch_control
  add column media_priority_until timestamptz,
  add column failure_streak integer not null default 0 check (failure_streak between 0 and 3);
update public.meta_fetch_control set min_interval_seconds=15 where region in ('KRW','USD');

create or replace function public.reserve_meta_fetch(p_region text,p_game_id uuid,p_purpose text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.meta_fetch_control%rowtype; token uuid; recent_failures int;
begin
  -- Every caller takes this regional row lock before checking/reserving a slot.
  select * into c from public.meta_fetch_control where region=p_region for update;
  if not found or c.paused_until > now() then return null; end if;
  -- A crashed worker cannot hold the region forever. Network timeouts are <=25s.
  if exists(select 1 from public.meta_fetch_attempts where region=p_region
    and success is null and started_at>now()-interval '2 minutes') then return null; end if;
  if exists(select 1 from public.meta_fetch_attempts where region=p_region
    and started_at>now()-make_interval(secs=>c.min_interval_seconds)) then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '1 hour') >= c.hourly_limit then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '24 hours') >= c.daily_limit then return null; end if;
  -- Retain the breaker for old deployments that still PATCH attempt results.
  select count(*) into recent_failures from (
    select a.success,v.outcome from public.meta_fetch_attempts a
    left join public.game_visit_refresh v on a.purpose='visit' and v.game_id=a.game_id and v.attempted_at=a.started_at
    where a.region=p_region and a.started_at>now()-interval '1 hour'
    order by a.started_at desc limit 3
  ) recent where success=false or (success is null and outcome='refresh_failed');
  if recent_failures>=3 then
    update public.meta_fetch_control set paused_until=now()+interval '1 hour' where region=p_region;
    return null;
  end if;
  insert into public.meta_fetch_attempts(region,game_id,purpose) values(p_region,p_game_id,p_purpose) returning id into token;
  return token;
end $$;

create or replace function public.claim_game_visit_refresh(p_game_id uuid,p_media_expired boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.games%rowtype; v public.game_visit_refresh%rowtype; c public.meta_fetch_control%rowtype;
  fetch_region text; token uuid; result jsonb;
begin
  select * into g from public.games where id=p_game_id and active and not admin_hidden;
  if not found then return null; end if;
  fetch_region:=case when g.krw_price is not null then 'KRW' when g.usd_price is not null or g.region_restricted or g.krw_store_available=false then 'USD' else 'KRW' end;
  select * into c from public.meta_fetch_control where region=fetch_region for update;
  if not found then return null; end if;
  select * into v from public.game_visit_refresh where game_id=p_game_id;
  if found and v.daily_attempted_at>now()-interval '24 hours' and not (p_media_expired and v.attempted_at<=now()-interval '1 hour') then return null; end if;
  if p_media_expired then
    -- Visible visitors retry briefly; this demand expires even if they leave.
    update public.meta_fetch_control set media_priority_until=now()+interval '90 seconds' where region=fetch_region;
  elsif c.media_priority_until>now() then
    return null;
  end if;
  token:=public.reserve_meta_fetch(fetch_region,p_game_id,'visit');
  if token is null then return null; end if;
  insert into public.game_visit_refresh(game_id,attempted_at,daily_attempted_at)
    values(p_game_id,now(),now())
  on conflict(game_id) do update set attempted_at=excluded.attempted_at,completed_at=null,outcome=null,
    refresh_daily=public.game_visit_refresh.daily_attempted_at<=now()-interval '24 hours',
    daily_attempted_at=case when public.game_visit_refresh.daily_attempted_at<=now()-interval '24 hours' then now() else public.game_visit_refresh.daily_attempted_at end
  returning jsonb_build_object('attempted_at',attempted_at,'refresh_daily',refresh_daily,'fetch_token',token) into result;
  return result;
end $$;

create function public.complete_meta_fetch(p_token uuid,p_success boolean,p_blocked boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.meta_fetch_attempts%rowtype; streak int; delay_seconds int;
begin
  if p_success is null then return false; end if;
  select * into a from public.meta_fetch_attempts where id=p_token;
  if not found then return false; end if;
  -- Same lock order as reservations: region, then attempt.
  perform 1 from public.meta_fetch_control where region=a.region for update;
  update public.meta_fetch_attempts set success=p_success where id=p_token and success is null;
  if not found then return false; end if;
  -- An expired worker's late result cannot reset a newer worker's backoff.
  if exists(select 1 from public.meta_fetch_attempts where region=a.region and started_at>a.started_at) then return true; end if;
  if p_success then
    update public.meta_fetch_control set failure_streak=0 where region=a.region;
  else
    update public.meta_fetch_control set failure_streak=least(failure_streak+1,3) where region=a.region returning failure_streak into streak;
    delay_seconds:=case when p_blocked or streak>=3 then 3600 when streak=2 then 300 else 60 end;
    update public.meta_fetch_control set paused_until=greatest(paused_until,clock_timestamp()+make_interval(secs=>delay_seconds)) where region=a.region;
  end if;
  return true;
end $$;

revoke all on function public.reserve_meta_fetch(text,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_game_visit_refresh(uuid,boolean) from public,anon,authenticated;
revoke all on function public.complete_meta_fetch(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.reserve_meta_fetch(text,uuid,text) to service_role;
grant execute on function public.claim_game_visit_refresh(uuid,boolean) to service_role;
grant execute on function public.complete_meta_fetch(uuid,boolean,boolean) to service_role;
