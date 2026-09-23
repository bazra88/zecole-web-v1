begin;
do $$
declare g uuid; a uuid; b uuid; claimed jsonb;
begin
  select id into g from public.games where active and not admin_hidden and krw_price is not null limit 1;
  if public.claim_game_visit_refresh(g,true) is not null then raise exception 'recovery pause failed'; end if;
  update public.meta_fetch_control set paused_until=now()-interval '1 second' where region='KRW';
  delete from public.meta_fetch_attempts where region='KRW';
  delete from public.game_visit_refresh where game_id=g;
  claimed:=public.claim_game_visit_refresh(g,false);
  if claimed->>'fetch_token' is null then raise exception 'eligible visit not admitted'; end if;
  if public.claim_game_visit_refresh(g,false) is not null then raise exception 'daily dedup failed'; end if;
  if public.reserve_meta_fetch('KRW',g,'trailer') is not null then raise exception 'spacing failed'; end if;
  update public.meta_fetch_attempts set started_at=now()-interval '2 minutes' where region='KRW';
  update public.meta_fetch_control set hourly_limit=1 where region='KRW';
  if public.reserve_meta_fetch('KRW',g,'trailer') is not null then raise exception 'hour cap failed'; end if;
  update public.meta_fetch_attempts set started_at=now()-interval '2 hours' where region='KRW';
  update public.meta_fetch_control set hourly_limit=20,daily_limit=1 where region='KRW';
  if public.reserve_meta_fetch('KRW',g,'trailer') is not null then raise exception 'day cap failed'; end if;
  update public.meta_fetch_control set daily_limit=100 where region='KRW';
  insert into public.meta_fetch_attempts(region,game_id,purpose,started_at,success)
    select 'KRW',g,'trailer',now()-make_interval(mins=>i),false from generate_series(2,4) i;
  if public.reserve_meta_fetch('KRW',g,'trailer') is not null then raise exception 'breaker failed'; end if;
  if not exists(select 1 from public.meta_fetch_control where region='KRW' and paused_until>now()+interval '59 minutes') then raise exception 'breaker did not pause'; end if;
  if has_function_privilege('anon','public.reserve_meta_fetch(text,uuid,text)','execute') then raise exception 'public reserve exposed'; end if;
  if has_function_privilege('service_role','public.claim_game_visit_refresh_unmetered(uuid,boolean)','execute') then raise exception 'unmetered bypass exposed'; end if;
end $$;
rollback;
