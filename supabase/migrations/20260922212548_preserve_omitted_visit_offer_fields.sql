create or replace function public.finish_game_visit_refresh(p_game_id uuid, p_attempted_at timestamptz, p_observation jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.games%rowtype;
  n public.games%rowtype;
  patch jsonb := '{}'::jsonb;
  expected text;
  amount numeric;
  original numeric;
  price_changed boolean := false;
  k text;
  daily boolean;
begin
  select refresh_daily into daily from public.game_visit_refresh where game_id=p_game_id
    and attempted_at=p_attempted_at and completed_at is null for update;
  if not found then return jsonb_build_object('changed',false,'skipped',true); end if;
  select * into g from public.games where id=p_game_id for update;
  expected := case when g.krw_price is not null then 'KRW'
    when g.usd_price is not null or g.region_restricted or g.krw_store_available=false then 'USD' else 'KRW' end;
  if daily and jsonb_typeof(p_observation->'rating')='number' and (p_observation->>'rating')::numeric between 0 and 5
    and g.rating is distinct from (p_observation->>'rating')::numeric then
    patch := patch || jsonb_build_object('rating',(p_observation->>'rating')::numeric);
  end if;
  if daily and jsonb_typeof(p_observation->'review_count')='number' and (p_observation->>'review_count')::numeric >= 0
    and g.review_count is distinct from (p_observation->>'review_count')::integer then
    patch := patch || jsonb_build_object('review_count',(p_observation->>'review_count')::integer);
  end if;
  if daily and p_observation->>'currency'=expected and jsonb_typeof(p_observation->'price')='number'
    and (p_observation->>'price')::numeric >= 0
    and (g.price_checked_at is null or g.price_checked_at <= p_attempted_at) then
    amount := (p_observation->>'price')::numeric;
    original := case when p_observation ? 'original_price' then (p_observation->>'original_price')::numeric else g.meta_store_original_price end;
    if original <= amount then original := null; end if;
    price_changed := g.current_price is distinct from amount or g.currency is distinct from expected
      or (case when expected='KRW' then g.krw_price else g.usd_price end) is distinct from amount
      or g.meta_store_original_price is distinct from original;
    if price_changed then
      patch := patch || jsonb_build_object('current_price',amount,'currency',expected,
        'original_price',original,'meta_store_original_price',original,'price_checked_at',p_attempted_at,
        'region_restricted',expected='USD','krw_store_available',expected='KRW',
        'pricing_type',case when amount=0 then 'free' else 'paid' end,
        case when expected='KRW' then 'krw_price' else 'usd_price' end,amount);
      if expected='USD' then
        patch := patch || jsonb_build_object('krw_converted_price',case when g.fx_rate_usd_krw > 0 then round(amount*g.fx_rate_usd_krw) else null end);
      end if;
    end if;
    if (p_observation ? 'offer_ends_at' and g.meta_store_offer_ends_at is distinct from (p_observation->>'offer_ends_at')::timestamptz)
      or (p_observation ? 'show_timer' and g.meta_store_show_timer is distinct from (p_observation->>'show_timer')::boolean) then
      patch := patch || jsonb_build_object('meta_store_offer_ends_at',case when p_observation ? 'offer_ends_at' then (p_observation->>'offer_ends_at')::timestamptz else g.meta_store_offer_ends_at end,
        'meta_store_show_timer',case when p_observation ? 'show_timer' then (p_observation->>'show_timer')::boolean else g.meta_store_show_timer end);
    end if;
  end if;
  foreach k in array array['description_long','description_long_ko'] loop
    if jsonb_typeof(p_observation->k)='string' and p_observation->>k <> ''
      and to_jsonb(g)->k is distinct from p_observation->k then
      patch := patch || jsonb_build_object(k,p_observation->k);
    end if;
  end loop;
  if patch <> '{}'::jsonb then
    n := jsonb_populate_record(g,patch);
    update public.games set rating=n.rating,review_count=n.review_count,
      current_price=n.current_price,original_price=n.original_price,currency=n.currency,
      krw_price=n.krw_price,usd_price=n.usd_price,krw_converted_price=n.krw_converted_price,
      region_restricted=n.region_restricted,krw_store_available=n.krw_store_available,
      pricing_type=n.pricing_type,price_checked_at=n.price_checked_at,
      meta_store_original_price=n.meta_store_original_price,meta_store_offer_ends_at=n.meta_store_offer_ends_at,
      meta_store_show_timer=n.meta_store_show_timer,description_long=n.description_long,
      description_long_ko=n.description_long_ko where id=p_game_id;
  end if;
  if price_changed then
    insert into public.price_history(game_id,current_price,original_price,currency,discount_percent,checked_at,sale_ends_at)
    values(p_game_id,amount,original,expected,case when original>amount then round((1-amount/original)*100,1) else 0 end,
      p_attempted_at,(p_observation->>'offer_ends_at')::timestamptz);
  end if;
  update public.game_visit_refresh set completed_at=clock_timestamp(),outcome=left(coalesce(p_observation->>'outcome','ok'),80)
    where game_id=p_game_id;
  return jsonb_build_object('changed',patch <> '{}'::jsonb,'price_changed',price_changed);
end;
$$;
