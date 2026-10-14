-- Execute inside BEGIN / ROLLBACK. No external calls; fixtures always roll back.
do $test$
declare g1 uuid; g2 uuid; visit uuid:=gen_random_uuid(); joined uuid:=gen_random_uuid();
  other_visit uuid:=gen_random_uuid(); old_visit uuid:=gen_random_uuid(); result jsonb; token uuid;
begin
  begin
    perform 1 from public.meta_fetch_control order by region for update;
    select id into g1 from public.games where active and not admin_hidden and krw_price is not null order by id limit 1;
    select id into g2 from public.games where active and not admin_hidden and krw_price is not null and id<>g1 order by id limit 1;
    if g1 is null or g2 is null then raise exception 'missing fixtures'; end if;
    delete from public.meta_fetch_attempts;
    delete from public.game_visit_refresh where game_id in (g1,g2);
    update public.meta_fetch_control set paused_until=now()-interval '1 second',media_priority_until=null,failure_streak=0;
    insert into public.meta_fetch_attempts(region,purpose,started_at,success)
      select 'KRW','test',now()-make_interval(secs=>120+n),true from generate_series(1,20) as s(n);
    result:=public.claim_game_visit_refresh_observed(g1,true,visit,0);
    if result is not null then raise exception 'hourly cap bypass'; end if;
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=visit and reason='hourly_limit' and hourly_used=20 and daily_used=20 and media_expired) then raise exception 'wrong hourly decision'; end if;
    perform public.claim_game_visit_refresh_observed(g1,true,visit,0);
    if (select count(*) from public.visit_refresh_decisions where visit_id=visit)<>1 then raise exception 'duplicate telemetry'; end if;
    if (select count(*) from public.meta_fetch_attempts)<>20 then raise exception 'telemetry consumed quota'; end if;
    delete from public.meta_fetch_attempts;
    result:=public.claim_game_visit_refresh_observed(g1,true,visit,1);
    token:=(result->>'fetch_token')::uuid;
    if token is null then raise exception 'retry not admitted'; end if;
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=visit and attempt=1 and outcome='granted' and fetch_token=token) then raise exception 'retry identity lost'; end if;
    if (select count(distinct visit_id) from public.visit_refresh_decisions where visit_id=visit)<>1 then raise exception 'retry counted as extra visit'; end if;
    perform public.claim_game_visit_refresh_observed(g1,true,joined,0);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=joined and reason='same_game_in_flight' and fetch_token=token) then raise exception 'shared worker misclassified'; end if;
    perform public.claim_game_visit_refresh_observed(g2,true,other_visit,0);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=other_visit and reason='region_in_flight') then raise exception 'regional worker misclassified'; end if;
    perform public.complete_meta_fetch(token,true,false);
    perform public.claim_game_visit_refresh_observed(g2,true,other_visit,1);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=other_visit and attempt=1 and reason='min_interval') then raise exception 'spacing misclassified'; end if;
    perform public.claim_game_visit_refresh_observed(g2,false,other_visit,2);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=other_visit and attempt=2 and reason='media_priority') then raise exception 'priority misclassified'; end if;
    update public.game_visit_refresh set completed_at=now(),outcome='ok' where game_id=g1;
    perform public.claim_game_visit_refresh_observed(g1,false,joined,1);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=joined and attempt=1 and outcome='fresh') then raise exception 'fresh counted as delay'; end if;
    perform public.claim_game_visit_refresh_observed(g1,true,joined,2);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=joined and attempt=2 and reason='game_cooldown') then raise exception 'cooldown misclassified'; end if;
    delete from public.meta_fetch_attempts;
    visit:=gen_random_uuid();
    update public.meta_fetch_control set paused_until=now()+interval '1 hour' where region='KRW';
    perform public.claim_game_visit_refresh_observed(g2,true,visit,0);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=visit and reason='region_paused') then raise exception 'pause misclassified'; end if;
    update public.meta_fetch_control set paused_until=now()-interval '1 second' where region='KRW';
    insert into public.meta_fetch_attempts(region,purpose,started_at,success)
      select 'KRW','test',now()-interval '2 hours'-make_interval(secs=>n),true from generate_series(1,100) as s(n);
    insert into public.visit_refresh_decisions(visit_id,game_id,attempt,region,media_expired,outcome,reason,recorded_at)
      values(old_visit,g1,0,'KRW',false,'fresh','fresh',now()-interval '31 days');
    perform public.claim_game_visit_refresh_observed(g2,true,visit,1);
    if not exists(select 1 from public.visit_refresh_decisions where visit_id=visit and attempt=1 and reason='daily_limit' and daily_used=100 and hourly_used=0) then raise exception 'daily cap misclassified'; end if;
    if exists(select 1 from public.visit_refresh_decisions where visit_id=old_visit) then raise exception 'retention failed'; end if;
    if (select count(*) from public.meta_fetch_attempts)<>100 then raise exception 'deferral made a fetch'; end if;
    -- Inject a NOT NULL telemetry failure. The already-granted claim must survive.
    delete from public.meta_fetch_attempts;
    update public.meta_fetch_control set media_priority_until=null;
    other_visit:=gen_random_uuid();
    result:=public.claim_game_visit_refresh_observed(g2,null,other_visit,0);
    if result is null then raise exception 'telemetry failure blocked claim'; end if;
    if exists(select 1 from public.visit_refresh_decisions where visit_id=other_visit) then raise exception 'invalid telemetry accepted'; end if;
    if (select count(*) from public.meta_fetch_attempts)<>1 then raise exception 'claim rolled back on logging failure'; end if;
    if has_table_privilege('anon','public.visit_refresh_decisions','select')
      or has_table_privilege('authenticated','public.visit_refresh_decisions','insert')
      or has_function_privilege('anon','public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer)','execute')
      or has_function_privilege('authenticated','public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer)','execute')
      or not has_function_privilege('service_role','public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer)','execute') then raise exception 'bad permissions'; end if;
    if not (select relrowsecurity from pg_class where oid='public.visit_refresh_decisions'::regclass) then raise exception 'RLS missing'; end if;
    if (select prosecdef from pg_proc where oid='public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer)'::regprocedure) then raise exception 'invoker required'; end if;
    raise exception using errcode='ZX001',message='observability tests passed; discard fixtures';
  exception when sqlstate 'ZX001' then null;
  end;
end $test$;
