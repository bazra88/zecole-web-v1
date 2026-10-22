-- Explicit API access: do not rely on Supabase automatic grants.
-- Existing RLS policies and row data are unchanged. Clients only read;
-- trusted server handlers authenticate separately and use service_role.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public."business_inquiries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."business_inquiries" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."business_inquiries" TO service_role;

ALTER TABLE public."content_games" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."content_games" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."content_games" TO anon;
GRANT SELECT ON TABLE public."content_games" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."content_games" TO service_role;

ALTER TABLE public."content_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."content_items" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."content_items" TO anon;
GRANT SELECT ON TABLE public."content_items" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."content_items" TO service_role;

ALTER TABLE public."content_products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."content_products" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."content_products" TO anon;
GRANT SELECT ON TABLE public."content_products" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."content_products" TO service_role;

ALTER TABLE public."game_genres" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."game_genres" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."game_genres" TO anon;
GRANT SELECT ON TABLE public."game_genres" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."game_genres" TO service_role;

ALTER TABLE public."game_media" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."game_media" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."game_media" TO anon;
GRANT SELECT ON TABLE public."game_media" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."game_media" TO service_role;

ALTER TABLE public."game_reviews" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."game_reviews" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."game_reviews" TO anon;
GRANT SELECT ON TABLE public."game_reviews" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."game_reviews" TO service_role;

ALTER TABLE public."game_videos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."game_videos" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."game_videos" TO anon;
GRANT SELECT ON TABLE public."game_videos" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."game_videos" TO service_role;

ALTER TABLE public."game_visit_refresh" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."game_visit_refresh" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."game_visit_refresh" TO service_role;

ALTER TABLE public."games" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."games" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."games" TO anon;
GRANT SELECT ON TABLE public."games" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."games" TO service_role;

ALTER TABLE public."genres" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."genres" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."genres" TO anon;
GRANT SELECT ON TABLE public."genres" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."genres" TO service_role;

ALTER TABLE public."horizon_plus_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."horizon_plus_entries" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."horizon_plus_entries" TO anon;
GRANT SELECT ON TABLE public."horizon_plus_entries" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."horizon_plus_entries" TO service_role;

ALTER TABLE public."meta_fetch_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."meta_fetch_attempts" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."meta_fetch_attempts" TO service_role;

ALTER TABLE public."meta_fetch_control" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."meta_fetch_control" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."meta_fetch_control" TO service_role;

ALTER TABLE public."price_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."price_history" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."price_history" TO anon;
GRANT SELECT ON TABLE public."price_history" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."price_history" TO service_role;

ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."products" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."products" TO anon;
GRANT SELECT ON TABLE public."products" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."products" TO service_role;

ALTER TABLE public."visit_refresh_decisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."visit_refresh_decisions" FROM PUBLIC, anon, authenticated, service_role;
-- Retention uses SELECT ... FOR UPDATE SKIP LOCKED, which needs UPDATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."visit_refresh_decisions" TO service_role;

REVOKE ALL ON TABLE public."games_storefront" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."games_storefront" TO anon;
GRANT SELECT ON TABLE public."games_storefront" TO authenticated;
GRANT SELECT ON TABLE public."games_storefront" TO service_role;

REVOKE ALL ON TABLE public."games_current_offer" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."games_current_offer" TO anon;
GRANT SELECT ON TABLE public."games_current_offer" TO authenticated;
GRANT SELECT ON TABLE public."games_current_offer" TO service_role;

REVOKE ALL ON SEQUENCE public."horizon_plus_entries_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public."horizon_plus_entries_id_seq" TO service_role;

REVOKE ALL ON SEQUENCE public."price_history_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public."price_history_id_seq" TO service_role;

REVOKE ALL ON SEQUENCE public."genres_id_seq" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public."genres_id_seq" TO service_role;

REVOKE ALL ON FUNCTION public.claim_game_visit_refresh(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_game_visit_refresh(uuid,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_game_visit_refresh_observed(uuid,boolean,uuid,integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_game_visit_refresh_unmetered(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_review_translations(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_review_translations(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_meta_fetch(uuid,boolean,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_meta_fetch(uuid,boolean,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.finish_game_visit_refresh(uuid,timestamp with time zone,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_game_visit_refresh(uuid,timestamp with time zone,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_meta_fetch(text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_meta_fetch(text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.save_new_release_order(uuid[],jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_new_release_order(uuid[],jsonb) TO service_role;
