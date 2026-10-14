-- One compact decision per page flow / retry. No IP, account, cookie or UA.
create table public.visit_refresh_decisions (
  visit_id uuid not null,
  game_id uuid not null references public.games(id) on delete cascade,
  attempt smallint not null check (attempt between 0 and 2),
  recorded_at timestamptz not null default now(),
  region text not null check (region in ('KRW','USD')),
  media_expired boolean not null,
  outcome text not null check (outcome in ('granted','fresh','joined','deferred')),
  reason text not null check (reason in ('granted','fresh','same_game_in_flight','game_cooldown',
    'media_priority','region_paused','region_in_flight','min_interval','hourly_limit','daily_limit','unknown')),
  hourly_used integer,
  daily_used integer,
  hourly_limit integer,
  daily_limit integer,
  fetch_token uuid,
  primary key (visit_id,game_id,attempt)
);
create index visit_refresh_decisions_recorded_at_idx on public.visit_refresh_decisions(recorded_at);
alter table public.visit_refresh_decisions enable row level security;
revoke all on public.visit_refresh_decisions from public,anon,authenticated;
grant select,insert,delete on public.visit_refresh_decisions to service_role;

-- The original claim remains the single authority. Inspect its decision while
-- still holding the SAME region lock, rather than inferring it later in JS.
create function public.claim_game_visit_refresh_observed(
  p_game_id uuid,p_media_expired boolean,p_visit_id uuid,p_attempt integer default 0
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  g public.games%rowtype; v public.game_visit_refresh%rowtype; c public.meta_fetch_control%rowtype;
  fetch_region text; result jsonb; decision text; why text; token uuid;
  used_hour integer; used_day integer;
begin
  if p_visit_id is null or p_attempt is null or p_attempt not between 0 and 2 then
    raise exception 'invalid_visit';
  end if;
  select * into g from public.games where id=p_game_id and active and not admin_hidden;
  if not found then return null; end if;
  fetch_region:=case when g.krw_price is not null then 'KRW' when g.usd_price is not null or g.region_restricted or g.krw_store_available=false then 'USD' else 'KRW' end;
  select * into c from public.meta_fetch_control where region=fetch_region for update;
  if not found then return public.claim_game_visit_refresh(p_game_id,p_media_expired); end if;
  select * into v from public.game_visit_refresh where game_id=p_game_id;
  result:=public.claim_game_visit_refresh(p_game_id,p_media_expired);

  -- Logging failure must not roll back a valid claim or block media refresh.
  begin
    if result is not null then
      decision:='granted'; why:='granted'; token:=(result->>'fetch_token')::uuid;
    elsif v.attempted_at>now()-interval '2 minutes' and v.completed_at is null then
      decision:='joined'; why:='same_game_in_flight';
      select id into token from public.meta_fetch_attempts
        where game_id=p_game_id and started_at=v.attempted_at and purpose='visit' limit 1;
    elsif v.daily_attempted_at>now()-interval '24 hours'
      and not (p_media_expired and v.attempted_at<=now()-interval '1 hour') then
      decision:=case when p_media_expired then 'deferred' else 'fresh' end;
      why:=case when p_media_expired then 'game_cooldown' else 'fresh' end;
    else
      decision:='deferred';
      -- reserve_meta_fetch may have activated the legacy failure breaker.
      select * into c from public.meta_fetch_control where region=fetch_region;
      select count(*) filter(where started_at>now()-interval '1 hour'),count(*)
        into used_hour,used_day from public.meta_fetch_attempts
        where region=fetch_region and started_at>now()-interval '24 hours';
      why:=case
        when not p_media_expired and c.media_priority_until>now() then 'media_priority'
        when c.paused_until>now() then 'region_paused'
        when exists(select 1 from public.meta_fetch_attempts where region=fetch_region and success is null and started_at>now()-interval '2 minutes') then 'region_in_flight'
        when exists(select 1 from public.meta_fetch_attempts where region=fetch_region and started_at>now()-make_interval(secs=>c.min_interval_seconds)) then 'min_interval'
        when used_hour>=c.hourly_limit then 'hourly_limit'
        when used_day>=c.daily_limit then 'daily_limit'
        else 'unknown' end;
    end if;
    insert into public.visit_refresh_decisions
      (visit_id,game_id,attempt,region,media_expired,outcome,reason,hourly_used,daily_used,hourly_limit,daily_limit,fetch_token)
      values(p_visit_id,p_game_id,p_attempt,fetch_region,p_media_expired,decision,why,used_hour,used_day,c.hourly_limit,c.daily_limit,token)
      on conflict do nothing;
    -- Bounded, indexed retention sweep. Skip rows being cleaned by another
    -- region to preserve region -> event lock order and avoid cross-region waits.
    delete from public.visit_refresh_decisions where ctid in (
      select ctid from public.visit_refresh_decisions where recorded_at<now()-interval '30 days'
      order by recorded_at limit 200 for update skip locked
    );
  exception when others then
    raise warning 'visit_refresh_observability_write_failed';
  end;
  return result;
end $$;
revoke all on function public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer) to service_role;
