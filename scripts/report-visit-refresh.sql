-- Server-only report. Change the interval for another window (retention: 30 days).
-- A visit means one page refresh flow, not a unique person. GET polling is not
-- counted. Decisions are atomic; estimated browser retry delays are not durations.
with events as (
  select * from public.visit_refresh_decisions where recorded_at>=now()-interval '7 days'
), visits as (
  select region,visit_id,game_id,
    bool_or(outcome='deferred') as deferred,
    bool_or(outcome='joined') as joined,
    bool_or(reason in ('hourly_limit','daily_limit')) as quota_blocked,
    bool_or(outcome='deferred' and media_expired) as media_deferred,
    min(recorded_at) filter(where outcome='deferred') as first_deferred,
    max(recorded_at) filter(where outcome='granted') as granted_at
  from events group by region,visit_id,game_id
)
select jsonb_build_object(
  'since',now()-interval '7 days',
  'coverage_started_at',(select min(recorded_at) from public.visit_refresh_decisions),
  'regions',(select jsonb_agg(t) from (
    select region,count(*) as page_visits,count(*) filter(where deferred) as deferred_visits,
      count(*) filter(where joined) as joined_visits,count(*) filter(where quota_blocked) as quota_blocked_visits,
      count(*) filter(where media_deferred) as expired_media_deferred_visits,
      count(*) filter(where granted_at>=first_deferred) as admitted_after_deferral,
      round(avg(extract(epoch from granted_at-first_deferred)) filter(where granted_at>=first_deferred),1) as seconds_to_admission
    from visits group by region
  )t),
  'reasons',(select jsonb_agg(t) from (
    select region,reason,count(*) as decision_count,count(distinct (visit_id,game_id)) as page_visits
    from events group by region,reason order by region,decision_count desc
  )t),
  'quota_pressure',(select jsonb_agg(t) from (
    select region,count(distinct (visit_id,game_id)) filter(where hourly_used>=hourly_limit) as visits_at_hour_cap,
      count(distinct (visit_id,game_id)) filter(where daily_used>=daily_limit) as visits_at_day_cap
    from events where outcome='deferred' group by region
  )t),
  'deferred_games',(select jsonb_agg(t) from (
    select e.game_id,g.name,e.region,count(distinct e.visit_id) as deferred_visits
    from events e join public.games g on g.id=e.game_id where e.outcome='deferred'
    group by e.game_id,g.name,e.region order by deferred_visits desc limit 10
  )t)
) as report;
