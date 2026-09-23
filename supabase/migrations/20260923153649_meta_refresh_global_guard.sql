-- Shared by every Vercel instance and by the Seoul visit claim.
create table public.meta_fetch_control (
  region text primary key check (region in ('KRW','USD')),
  paused_until timestamptz not null default now(),
  min_interval_seconds integer not null default 60,
  hourly_limit integer not null default 20,
  daily_limit integer not null default 100
);
create table public.meta_fetch_attempts (
  id uuid primary key default gen_random_uuid(),
  region text not null references public.meta_fetch_control(region),
  game_id uuid references public.games(id) on delete cascade,
  purpose text not null,
  started_at timestamptz not null default now(),
  success boolean
);
create index meta_fetch_attempts_region_time on public.meta_fetch_attempts(region,started_at desc);
alter table public.meta_fetch_control enable row level security;
alter table public.meta_fetch_attempts enable row level security;
revoke all on public.meta_fetch_control, public.meta_fetch_attempts from public,anon,authenticated;
grant all on public.meta_fetch_control, public.meta_fetch_attempts to service_role;
-- Recovery period after the observed 1,450 failures. Stored pages stay available.
insert into public.meta_fetch_control(region,paused_until) values ('KRW',now()+interval '6 hours'),('USD',now()+interval '6 hours');

create function public.reserve_meta_fetch(p_region text,p_game_id uuid,p_purpose text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.meta_fetch_control%rowtype; token uuid; recent_failures int;
begin
  select * into c from public.meta_fetch_control where region=p_region for update;
  if not found or c.paused_until > now() then return null; end if;
  if exists(select 1 from public.meta_fetch_attempts where region=p_region and started_at>now()-make_interval(secs=>c.min_interval_seconds)) then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '1 hour') >= c.hourly_limit then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '24 hours') >= c.daily_limit then return null; end if;
  select count(*) into recent_failures from (
    select a.success, v.outcome from public.meta_fetch_attempts a
    left join public.game_visit_refresh v on a.purpose='visit' and v.game_id=a.game_id and v.attempted_at=a.started_at
    where a.region=p_region and a.started_at>now()-interval '1 hour'
    order by a.started_at desc limit 3
  ) recent where success=false or (success is null and outcome='refresh_failed');
  if recent_failures >= 3 then
    update public.meta_fetch_control set paused_until=now()+interval '1 hour' where region=p_region;
    return null;
  end if;
  insert into public.meta_fetch_attempts(region,game_id,purpose) values(p_region,p_game_id,p_purpose) returning id into token;
  return token;
end $$;
revoke all on function public.reserve_meta_fetch(text,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_meta_fetch(text,uuid,text) to service_role;

alter function public.claim_game_visit_refresh(uuid,boolean) rename to claim_game_visit_refresh_unmetered;
revoke all on function public.claim_game_visit_refresh_unmetered(uuid,boolean) from service_role;
-- Inline the original atomic per-game claim so there is no unmetered service-role bypass.
create function public.claim_game_visit_refresh(p_game_id uuid,p_media_expired boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare g public.games%rowtype; v public.game_visit_refresh%rowtype; fetch_region text; token uuid; result jsonb;
begin
  select * into g from public.games where id=p_game_id and active and not admin_hidden;
  if not found then return null; end if;
  fetch_region:=case when g.krw_price is not null then 'KRW' when g.usd_price is not null or g.region_restricted or g.krw_store_available=false then 'USD' else 'KRW' end;
  perform 1 from public.meta_fetch_control where meta_fetch_control.region=fetch_region for update;
  select * into v from public.game_visit_refresh where game_id=p_game_id;
  if found and v.daily_attempted_at>now()-interval '24 hours' and not (p_media_expired and v.attempted_at<=now()-interval '1 hour') then return null; end if;
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
revoke all on function public.claim_game_visit_refresh(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_game_visit_refresh(uuid,boolean) to service_role;
