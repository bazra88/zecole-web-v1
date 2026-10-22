-- Synthetic fixtures only. No calls to Meta, mail providers or production.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.games(id,meta_product_id,meta_catalog_item_id,name,slug,active,krw_price)
VALUES ('00000000-0000-4000-8000-000000000001','access-test-visible','access-test-visible','Access test','access-test-visible',true,10000),
       ('00000000-0000-4000-8000-000000000002','access-test-inactive','access-test-inactive','Inactive test','access-test-inactive',false,10000);
INSERT INTO public.game_media(game_id,media_type,url,active)
VALUES ('00000000-0000-4000-8000-000000000001','screenshot','https://example.invalid/test.png',true),
       ('00000000-0000-4000-8000-000000000001','screenshot','https://example.invalid/inactive.png',false);
INSERT INTO public.genres(name,slug) VALUES ('Access test','access-test');
INSERT INTO public.price_history(game_id,current_price,currency)
VALUES ('00000000-0000-4000-8000-000000000001',10000,'KRW');
INSERT INTO public.horizon_plus_entries(month,category,external_game_name)
VALUES ('2099-01-01','monthly_games','Access test');
INSERT INTO public.business_inquiries(contact_name,email,inquiry_type,subject,message)
VALUES ('Access test','test@example.invalid','other','Access test','Synthetic local fixture');
-- Service-role RPCs and their dependent tables/sequences must work too.
INSERT INTO public.meta_fetch_control(region,min_interval_seconds,hourly_limit,daily_limit)
VALUES ('KRW',15,20,100),('USD',15,20,100);
DO $test$ DECLARE result jsonb; finished jsonb; BEGIN
  result := public.claim_game_visit_refresh_observed('00000000-0000-4000-8000-000000000001',true,'00000000-0000-4000-8000-000000000003',0);
  IF result->>'fetch_token' IS NULL THEN RAISE EXCEPTION 'Server refresh claim failed'; END IF;
  IF NOT public.complete_meta_fetch((result->>'fetch_token')::uuid,true,false) THEN RAISE EXCEPTION 'Server completion failed'; END IF;
  finished := public.finish_game_visit_refresh('00000000-0000-4000-8000-000000000001',(result->>'attempted_at')::timestamptz,'{"currency":"KRW","price":9000,"original_price":10000}');
  IF finished->>'price_changed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Server price refresh failed'; END IF;
  IF (SELECT count(*) FROM public.visit_refresh_decisions) <> 1 THEN RAISE EXCEPTION 'Refresh log missing'; END IF;
END $test$;

SET LOCAL ROLE anon;
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.games) <> 1 THEN RAISE EXCEPTION 'Public active-game policy failed'; END IF;
  IF (SELECT count(*) FROM public.game_media) <> 1 THEN RAISE EXCEPTION 'Public active-media policy failed'; END IF;
  IF (SELECT count(*) FROM public.games_storefront) <> 1 THEN RAISE EXCEPTION 'Storefront view failed'; END IF;
  BEGIN
    PERFORM 1 FROM public.business_inquiries;
    RAISE EXCEPTION 'Anonymous visitor could read inquiries';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.games SET name='unauthorized';
    RAISE EXCEPTION 'Anonymous visitor could write games';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reserve_meta_fetch('KRW',NULL,'unauthorized');
    RAISE EXCEPTION 'Anonymous visitor could trigger crawler';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
  IF (SELECT count(*) FROM public.games) <> 1 THEN RAISE EXCEPTION 'Authenticated read failed'; END IF;
  BEGIN
    PERFORM 1 FROM public.business_inquiries;
    RAISE EXCEPTION 'Authenticated visitor could read inquiries';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
