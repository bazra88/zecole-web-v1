-- No external requests. All fixture changes roll back inside the exception block.
-- Any assertion failure escapes, causing the surrounding migration to roll back.
do $test$
declare g1 uuid; g2 uuid; a uuid; b uuid; claim jsonb; i int; streak int;
begin
  begin
    perform 1 from public.meta_fetch_control order by region for update;
    if (select count(*) from public.meta_fetch_control where min_interval_seconds=15 and hourly_limit=20 and daily_limit=100)<>2 then
      raise exception 'unexpected regional budgets';
    end if;
    select id into g1 from public.games where active and not admin_hidden and krw_price is not null order by id limit 1;
    select id into g2 from public.games where active and not admin_hidden and krw_price is not null and id<>g1 order by id limit 1;
    if g1 is null or g2 is null then raise exception 'missing test games'; end if;
    delete from public.meta_fetch_attempts;
    delete from public.game_visit_refresh where game_id in (g1,g2);
    update public.meta_fetch_control set paused_until=now()+interval '1 hour',media_priority_until=null,failure_streak=0;
    if public.claim_game_visit_refresh(g1,false) is not null then raise exception 'pause bypassed'; end if;
    update public.meta_fetch_control set paused_until=now()-interval '1 second';
    claim:=public.claim_game_visit_refresh(g1,true);
    a:=(claim->>'fetch_token')::uuid;
    if a is null then raise exception 'media claim rejected'; end if;
    if public.claim_game_visit_refresh(g1,true) is not null then raise exception 'same-game duplicate accepted'; end if;
    update public.meta_fetch_attempts set started_at=now()-interval '20 seconds' where id=a;
    if public.reserve_meta_fetch('KRW',g2,'test') is not null then raise exception 'active worker overlapped after 15s'; end if;
    b:=public.reserve_meta_fetch('USD',null,'test');
    if b is null then raise exception 'KRW worker blocked independent USD region'; end if;
    perform public.complete_meta_fetch(b,true,false);
    perform public.complete_meta_fetch(a,true,false);
    if public.claim_game_visit_refresh(g2,false) is not null then raise exception 'daily check jumped media priority'; end if;
    claim:=public.claim_game_visit_refresh(g2,true);
    b:=(claim->>'fetch_token')::uuid;
    if b is null then raise exception 'waiting media could not take released slot'; end if;
    if (claim->>'refresh_daily')::boolean is not true then raise exception 'media fetch lost due daily check'; end if;
    perform public.complete_meta_fetch(b,true,false);
    if public.reserve_meta_fetch('KRW',null,'test') is not null then raise exception '15s spacing bypassed'; end if;
    update public.meta_fetch_attempts set started_at=now()-interval '14 seconds' where id=b;
    if public.reserve_meta_fetch('KRW',null,'test') is not null then raise exception '14s spacing accepted'; end if;
    update public.meta_fetch_attempts set started_at=now()-interval '16 seconds' where id=b;
    a:=public.reserve_meta_fetch('KRW',null,'test');
    if a is null then raise exception '16s spacing rejected'; end if;
    update public.meta_fetch_attempts set started_at=now()-interval '121 seconds' where id=a;
    b:=public.reserve_meta_fetch('KRW',null,'test');
    if b is null then raise exception 'crashed worker lease never released'; end if;
    perform public.complete_meta_fetch(b,false,false);
    if (select failure_streak from public.meta_fetch_control where region='KRW')<>1 then raise exception 'first failure not counted'; end if;
    perform public.complete_meta_fetch(a,true,false);
    if (select failure_streak from public.meta_fetch_control where region='KRW')<>1 then raise exception 'late worker reset newer failure'; end if;

    delete from public.meta_fetch_attempts;
    update public.meta_fetch_control set paused_until=now()-interval '1 second',failure_streak=0,media_priority_until=null;
    for i in 1..3 loop
      insert into public.meta_fetch_attempts(region,purpose) values('KRW','test') returning id into a;
      perform public.complete_meta_fetch(a,false,false);
      if not exists(select 1 from public.meta_fetch_control where region='KRW' and failure_streak=i
        and paused_until>=now()+make_interval(secs=>case i when 1 then 60 when 2 then 300 else 3600 end)) then
        raise exception 'wrong adaptive delay for failure %',i;
      end if;
      if public.reserve_meta_fetch('KRW',null,'test') is not null then raise exception 'failure pause bypassed'; end if;
      update public.meta_fetch_control set paused_until=now()-interval '1 second' where region='KRW';
    end loop;
    insert into public.meta_fetch_attempts(region,purpose) values('KRW','test') returning id into a;
    perform public.complete_meta_fetch(a,true,false);
    if (select failure_streak from public.meta_fetch_control where region='KRW')<>0 then raise exception 'success did not reset streak'; end if;
    if public.complete_meta_fetch(a,false,true) then raise exception 'duplicate result accepted'; end if;
    insert into public.meta_fetch_attempts(region,purpose) values('KRW','test') returning id into a;
    perform public.complete_meta_fetch(a,false,true);
    if not exists(select 1 from public.meta_fetch_control where region='KRW' and failure_streak=1 and paused_until>=now()+interval '1 hour') then raise exception '429 did not pause immediately'; end if;

    delete from public.meta_fetch_attempts;
    update public.meta_fetch_control set paused_until=now()-interval '1 second',failure_streak=0;
    insert into public.meta_fetch_attempts(region,purpose,started_at,success)
      select 'KRW','test',now()-make_interval(secs=>120+seq.n),true from generate_series(1,20) as seq(n);
    if public.reserve_meta_fetch('KRW',null,'test') is not null then raise exception 'hourly 20 cap bypassed'; end if;
    delete from public.meta_fetch_attempts;
    insert into public.meta_fetch_attempts(region,purpose,started_at,success)
      select 'KRW','test',now()-interval '2 hours'-make_interval(secs=>seq.n),true from generate_series(1,100) as seq(n);
    if public.reserve_meta_fetch('KRW',null,'test') is not null then raise exception 'daily 100 cap bypassed'; end if;
    if has_function_privilege('anon','public.complete_meta_fetch(uuid,boolean,boolean)','execute')
      or has_function_privilege('authenticated','public.complete_meta_fetch(uuid,boolean,boolean)','execute')
      or not has_function_privilege('service_role','public.complete_meta_fetch(uuid,boolean,boolean)','execute') then raise exception 'incorrect function permissions'; end if;
    if exists(select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public'
      and p.proname in ('complete_meta_fetch','claim_game_visit_refresh','reserve_meta_fetch') and p.prosecdef) then raise exception 'security definer introduced'; end if;
    -- This deliberate exception reverts every fixture write, including deletes.
    raise exception using errcode='ZX001',message='adaptive refresh checks passed; discard fixtures';
  exception when sqlstate 'ZX001' then null;
  end;
end $test$;
