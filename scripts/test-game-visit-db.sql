begin;
do $$
declare g public.games%rowtype; claim jsonb; result jsonb; old_updated timestamptz; before_count bigint; after_count bigint;
begin
  select * into g from public.games where active and not admin_hidden and krw_price>0 and meta_store_original_price is null limit 1;
  old_updated := g.updated_at;
  select count(*) into before_count from public.price_history where game_id=g.id;
  claim := public.claim_game_visit_refresh(g.id,false);
  if claim is null then raise exception 'initial claim failed'; end if;
  if public.claim_game_visit_refresh(g.id,false) is not null then raise exception 'duplicate claim accepted'; end if;
  result := public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,
    jsonb_build_object('rating',g.rating,'review_count',g.review_count,'currency','USD','price',12345));
  if (result->>'changed')::boolean then raise exception 'unchanged stats or wrong currency wrote game'; end if;
  if (select updated_at from public.games where id=g.id) is distinct from old_updated then raise exception 'no-op updated timestamp'; end if;
  if public.claim_game_visit_refresh(g.id,true) is not null then raise exception 'media bypassed immediate cooldown'; end if;
  update public.game_visit_refresh set daily_attempted_at=now()-interval '25 hours',attempted_at=now()-interval '25 hours' where game_id=g.id;
  claim := public.claim_game_visit_refresh(g.id,false);
  result := public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,
    jsonb_build_object('currency','KRW','price',g.krw_price+100,'original_price',null,'show_timer',false));
  if not (result->>'price_changed')::boolean then raise exception 'changed price not applied'; end if;
  perform public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,jsonb_build_object('currency','KRW','price',g.krw_price+200));
  select count(*) into after_count from public.price_history where game_id=g.id;
  if after_count-before_count <> 1 then raise exception 'price history not exactly once'; end if;
  update public.game_visit_refresh set attempted_at=now()-interval '2 hours' where game_id=g.id;
  claim := public.claim_game_visit_refresh(g.id,true);
  if (claim->>'refresh_daily')::boolean then raise exception 'media refresh reenabled daily fields'; end if;
  result := public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,jsonb_build_object('currency','KRW','price',1,'rating',0));
  if (result->>'changed')::boolean then raise exception 'media refresh changed daily data'; end if;
  if has_function_privilege('anon','public.claim_game_visit_refresh(uuid,boolean)','execute') then raise exception 'public claim access'; end if;
  if has_table_privilege('anon','public.game_visit_refresh','select') then raise exception 'public state access'; end if;
end $$;
do $$
declare g public.games%rowtype; claim jsonb; result jsonb; before_count bigint;
begin
  select * into g from public.games where active and not admin_hidden and krw_price is null
    and usd_price>0 and meta_store_original_price>usd_price limit 1;
  update public.game_visit_refresh set attempted_at=now()-interval '25 hours',daily_attempted_at=now()-interval '25 hours' where game_id=g.id;
  select count(*) into before_count from public.price_history where game_id=g.id;
  claim := public.claim_game_visit_refresh(g.id,false);
  result := public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,
    jsonb_build_object('currency','USD','price',g.usd_price,'rating',g.rating,'review_count',g.review_count));
  if (result->>'changed')::boolean then raise exception 'omitted offer fields changed unchanged USD game'; end if;
  if (select count(*) from public.price_history where game_id=g.id) <> before_count then raise exception 'unchanged USD appended history'; end if;
  if (select meta_store_original_price from public.games where id=g.id) is distinct from g.meta_store_original_price then raise exception 'omitted original cleared sale'; end if;
  update public.game_visit_refresh set attempted_at=now()-interval '25 hours',daily_attempted_at=now()-interval '25 hours' where game_id=g.id;
  claim := public.claim_game_visit_refresh(g.id,false);
  result := public.finish_game_visit_refresh(g.id,(claim->>'attempted_at')::timestamptz,
    jsonb_build_object('currency','USD','price',g.meta_store_original_price));
  if (select meta_store_original_price from public.games where id=g.id) is not null then raise exception 'regular price failed to end sale'; end if;
end $$;
rollback;
