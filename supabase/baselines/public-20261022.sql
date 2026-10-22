-- Structure only, captured from Zecole production on 2026-10-22.
-- EMPTY DATABASE ONLY. Not an incremental production migration or data backup.
-- Required roles: anon, authenticated, service_role (BYPASSRLS).
-- Forward migrations: filenames newer than 20261014081123.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL check_function_bodies = off;
DO $empty$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) THEN
 RAISE EXCEPTION 'Baseline requires an empty public schema; never apply to production';
 END IF;
END $empty$;

CREATE TABLE public."business_inquiries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_name" text,
  "contact_name" text NOT NULL,
  "email" text NOT NULL,
  "inquiry_type" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "related_url" text,
  "status" text DEFAULT 'new'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."business_inquiries" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."content_games" (
  "content_id" uuid NOT NULL,
  "game_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);
ALTER TABLE public."content_games" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."content_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "content_type" text NOT NULL,
  "summary" text,
  "body" text,
  "thumbnail_url" text,
  "youtube_video_id" text,
  "youtube_url" text,
  "published_at" timestamp with time zone,
  "featured" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."content_items" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."content_products" (
  "content_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);
ALTER TABLE public."content_products" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."game_genres" (
  "game_id" uuid NOT NULL,
  "genre_id" bigint NOT NULL
);
ALTER TABLE public."game_genres" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."game_media" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "media_type" text NOT NULL,
  "url" text NOT NULL,
  "thumbnail_url" text,
  "width" integer,
  "height" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'meta_store'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."game_media" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."game_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "meta_review_id" text NOT NULL,
  "reviewer_label" text NOT NULL,
  "rating" smallint,
  "title_original" text,
  "body_original" text,
  "title_ko" text,
  "body_ko" text,
  "helpful_count" integer,
  "reviewed_at" timestamp with time zone,
  "source" text DEFAULT 'meta_store'::text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "translation_attempted_at" timestamp with time zone
);
ALTER TABLE public."game_reviews" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."game_videos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL,
  "youtube_video_id" text NOT NULL,
  "youtube_url" text,
  "title" text,
  "thumbnail_url" text,
  "video_type" text DEFAULT 'play'::text NOT NULL,
  "published_at" timestamp with time zone,
  "is_featured" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."game_videos" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."game_visit_refresh" (
  "game_id" uuid NOT NULL,
  "attempted_at" timestamp with time zone NOT NULL,
  "daily_attempted_at" timestamp with time zone NOT NULL,
  "refresh_daily" boolean DEFAULT true NOT NULL,
  "completed_at" timestamp with time zone,
  "outcome" text
);
ALTER TABLE public."game_visit_refresh" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."games" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "meta_product_id" text NOT NULL,
  "meta_catalog_id" text,
  "meta_catalog_item_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "affiliate_url" text,
  "meta_store_url" text,
  "image_path" text,
  "source_image_url" text,
  "current_price" numeric(12,2),
  "original_price" numeric(12,2),
  "currency" character varying(3) DEFAULT 'USD'::character varying NOT NULL,
  "description" text,
  "developer" text,
  "publisher" text,
  "release_date" date,
  "rating" numeric(3,2),
  "review_count" integer,
  "supports_korean" boolean,
  "supports_quest_2" boolean,
  "supports_quest_3" boolean,
  "supports_quest_3s" boolean,
  "source_status" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pricing_type" text,
  "affiliate_discount_percent" numeric(5,2),
  "affiliate_discount_active" boolean DEFAULT false NOT NULL,
  "first_iap_discount_percent" numeric(5,2),
  "krw_price" numeric(12,2),
  "usd_price" numeric(12,2),
  "krw_converted_price" numeric(12,2),
  "krw_store_available" boolean,
  "region_restricted" boolean DEFAULT false NOT NULL,
  "fx_rate_usd_krw" numeric(12,4),
  "price_checked_at" timestamp with time zone,
  "motion_sickness_level" smallint,
  "movement_mode" text,
  "turning_mode" text,
  "seated_supported" boolean,
  "standing_supported" boolean,
  "beginner_recommended" boolean DEFAULT false NOT NULL,
  "advanced_recommended" boolean DEFAULT false NOT NULL,
  "zecole_recommended" boolean DEFAULT false NOT NULL,
  "popularity_score" numeric(12,4),
  "base_affiliate_discount_percent" numeric(5,2),
  "promo_affiliate_discount_percent" numeric(5,2),
  "promo_starts_at" timestamp with time zone,
  "promo_ends_at" timestamp with time zone,
  "promo_label" text,
  "meta_store_original_price" numeric,
  "meta_store_offer_ends_at" timestamp with time zone,
  "meta_store_show_timer" boolean DEFAULT false NOT NULL,
  "admin_hidden" boolean DEFAULT false NOT NULL,
  "admin_new_release_pinned" boolean DEFAULT false NOT NULL,
  "description_long" text,
  "description_long_ko" text,
  "supported_languages" text[],
  "admin_new_release_order" integer
);
ALTER TABLE public."games" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."genres" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."genres_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL
);
ALTER TABLE public."genres" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."horizon_plus_entries" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."horizon_plus_entries_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "month" date NOT NULL,
  "category" text NOT NULL,
  "game_id" uuid,
  "external_game_name" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."horizon_plus_entries" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."meta_fetch_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "region" text NOT NULL,
  "game_id" uuid,
  "purpose" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "success" boolean
);
ALTER TABLE public."meta_fetch_attempts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."meta_fetch_control" (
  "region" text NOT NULL,
  "paused_until" timestamp with time zone DEFAULT now() NOT NULL,
  "min_interval_seconds" integer DEFAULT 60 NOT NULL,
  "hourly_limit" integer DEFAULT 20 NOT NULL,
  "daily_limit" integer DEFAULT 100 NOT NULL,
  "media_priority_until" timestamp with time zone,
  "failure_streak" integer DEFAULT 0 NOT NULL
);
ALTER TABLE public."meta_fetch_control" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."price_history" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public."price_history_id_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE) NOT NULL,
  "game_id" uuid NOT NULL,
  "current_price" numeric(12,2) NOT NULL,
  "original_price" numeric(12,2),
  "currency" character varying(3) DEFAULT 'USD'::character varying NOT NULL,
  "discount_percent" numeric(5,2),
  "sale_starts_at" timestamp with time zone,
  "sale_ends_at" timestamp with time zone,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."price_history" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "product_type" text NOT NULL,
  "model" text,
  "description" text,
  "image_path" text,
  "source_image_url" text,
  "affiliate_url" text,
  "official_url" text,
  "krw_price" numeric(12,2),
  "usd_price" numeric(12,2),
  "currency" character varying(3) DEFAULT 'KRW'::character varying,
  "region_restricted" boolean DEFAULT false NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "benefit_type" text,
  "benefit_value" numeric(12,2),
  "benefit_currency" character varying(3),
  "benefit_label" text,
  "benefit_active" boolean DEFAULT false NOT NULL,
  "benefit_starts_at" timestamp with time zone,
  "benefit_ends_at" timestamp with time zone
);
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."visit_refresh_decisions" (
  "visit_id" uuid NOT NULL,
  "game_id" uuid NOT NULL,
  "attempt" smallint NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "region" text NOT NULL,
  "media_expired" boolean NOT NULL,
  "outcome" text NOT NULL,
  "reason" text NOT NULL,
  "hourly_used" integer,
  "daily_used" integer,
  "hourly_limit" integer,
  "daily_limit" integer,
  "fetch_token" uuid
);
ALTER TABLE public."visit_refresh_decisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."business_inquiries" ADD CONSTRAINT "business_inquiries_inquiry_type_check" CHECK (inquiry_type = ANY (ARRAY['advertising'::text, 'sponsorship'::text, 'game_review'::text, 'product_review'::text, 'partnership'::text, 'event_press'::text, 'other'::text]));

ALTER TABLE public."business_inquiries" ADD CONSTRAINT "business_inquiries_status_check" CHECK (status = ANY (ARRAY['new'::text, 'reviewing'::text, 'replied'::text, 'closed'::text, 'spam'::text]));

ALTER TABLE public."content_items" ADD CONSTRAINT "content_items_content_type_check" CHECK (content_type = ANY (ARRAY['vr_news'::text, 'new_release'::text, 'beginner_guide'::text, 'review'::text, 'youtube'::text, 'horizon_plus_update'::text, 'buying_guide'::text, 'other'::text]));

ALTER TABLE public."game_media" ADD CONSTRAINT "game_media_media_type_check" CHECK (media_type = ANY (ARRAY['trailer'::text, 'screenshot'::text]));

ALTER TABLE public."game_reviews" ADD CONSTRAINT "game_reviews_rating_check" CHECK (rating IS NULL OR rating >= 1 AND rating <= 5);

ALTER TABLE public."game_videos" ADD CONSTRAINT "game_videos_video_type_check" CHECK (video_type = ANY (ARRAY['play'::text, 'review'::text, 'guide'::text, 'shorts'::text, 'news'::text, 'other'::text]));

ALTER TABLE public."games" ADD CONSTRAINT "games_admin_new_release_order_check" CHECK (admin_new_release_order IS NULL OR admin_new_release_order >= 0);

ALTER TABLE public."games" ADD CONSTRAINT "games_affiliate_discount_percent_check" CHECK (affiliate_discount_percent IS NULL OR affiliate_discount_percent >= 0::numeric AND affiliate_discount_percent <= 100::numeric);

ALTER TABLE public."games" ADD CONSTRAINT "games_base_affiliate_discount_percent_check" CHECK (base_affiliate_discount_percent IS NULL OR base_affiliate_discount_percent >= 0::numeric AND base_affiliate_discount_percent <= 100::numeric);

ALTER TABLE public."games" ADD CONSTRAINT "games_first_iap_discount_percent_check" CHECK (first_iap_discount_percent IS NULL OR first_iap_discount_percent >= 0::numeric AND first_iap_discount_percent <= 100::numeric);

ALTER TABLE public."games" ADD CONSTRAINT "games_motion_sickness_level_check" CHECK (motion_sickness_level IS NULL OR motion_sickness_level >= 1 AND motion_sickness_level <= 5);

ALTER TABLE public."games" ADD CONSTRAINT "games_pricing_type_check" CHECK (pricing_type IS NULL OR (pricing_type = ANY (ARRAY['paid'::text, 'free'::text, 'free_to_play'::text, 'subscription'::text, 'unknown'::text])));

ALTER TABLE public."games" ADD CONSTRAINT "games_promo_affiliate_discount_percent_check" CHECK (promo_affiliate_discount_percent IS NULL OR promo_affiliate_discount_percent >= 0::numeric AND promo_affiliate_discount_percent <= 100::numeric);

ALTER TABLE public."games" ADD CONSTRAINT "games_rating_check" CHECK (rating IS NULL OR rating >= 0::numeric AND rating <= 5::numeric);

ALTER TABLE public."games" ADD CONSTRAINT "games_review_count_check" CHECK (review_count IS NULL OR review_count >= 0);

ALTER TABLE public."horizon_plus_entries" ADD CONSTRAINT "horizon_plus_entries_category_check" CHECK (category = ANY (ARRAY['monthly_games'::text, 'horizon_catalog'::text, 'indie_catalog'::text]));

ALTER TABLE public."horizon_plus_entries" ADD CONSTRAINT "horizon_plus_game_or_name_check" CHECK (game_id IS NOT NULL OR external_game_name IS NOT NULL);

ALTER TABLE public."meta_fetch_control" ADD CONSTRAINT "meta_fetch_control_failure_streak_check" CHECK (failure_streak >= 0 AND failure_streak <= 3);

ALTER TABLE public."meta_fetch_control" ADD CONSTRAINT "meta_fetch_control_region_check" CHECK (region = ANY (ARRAY['KRW'::text, 'USD'::text]));

ALTER TABLE public."price_history" ADD CONSTRAINT "price_history_discount_percent_check" CHECK (discount_percent IS NULL OR discount_percent >= 0::numeric AND discount_percent <= 100::numeric);

ALTER TABLE public."products" ADD CONSTRAINT "products_benefit_type_check" CHECK (benefit_type IS NULL OR (benefit_type = ANY (ARRAY['store_credit'::text, 'discount_percent'::text, 'gift'::text, 'other'::text])));

ALTER TABLE public."products" ADD CONSTRAINT "products_product_type_check" CHECK (product_type = ANY (ARRAY['quest_headset'::text, 'rayban_meta'::text, 'accessory'::text, 'other'::text]));

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_attempt_check" CHECK (attempt >= 0 AND attempt <= 2);

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_outcome_check" CHECK (outcome = ANY (ARRAY['granted'::text, 'fresh'::text, 'joined'::text, 'deferred'::text]));

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_reason_check" CHECK (reason = ANY (ARRAY['granted'::text, 'fresh'::text, 'same_game_in_flight'::text, 'game_cooldown'::text, 'media_priority'::text, 'region_paused'::text, 'region_in_flight'::text, 'min_interval'::text, 'hourly_limit'::text, 'daily_limit'::text, 'unknown'::text]));

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_region_check" CHECK (region = ANY (ARRAY['KRW'::text, 'USD'::text]));

ALTER TABLE public."business_inquiries" ADD CONSTRAINT "business_inquiries_pkey" PRIMARY KEY (id);

ALTER TABLE public."content_games" ADD CONSTRAINT "content_games_pkey" PRIMARY KEY (content_id, game_id);

ALTER TABLE public."content_items" ADD CONSTRAINT "content_items_pkey" PRIMARY KEY (id);

ALTER TABLE public."content_products" ADD CONSTRAINT "content_products_pkey" PRIMARY KEY (content_id, product_id);

ALTER TABLE public."game_genres" ADD CONSTRAINT "game_genres_pkey" PRIMARY KEY (game_id, genre_id);

ALTER TABLE public."game_media" ADD CONSTRAINT "game_media_pkey" PRIMARY KEY (id);

ALTER TABLE public."game_reviews" ADD CONSTRAINT "game_reviews_pkey" PRIMARY KEY (id);

ALTER TABLE public."game_videos" ADD CONSTRAINT "game_videos_pkey" PRIMARY KEY (id);

ALTER TABLE public."game_visit_refresh" ADD CONSTRAINT "game_visit_refresh_pkey" PRIMARY KEY (game_id);

ALTER TABLE public."games" ADD CONSTRAINT "games_pkey" PRIMARY KEY (id);

ALTER TABLE public."genres" ADD CONSTRAINT "genres_pkey" PRIMARY KEY (id);

ALTER TABLE public."horizon_plus_entries" ADD CONSTRAINT "horizon_plus_entries_pkey" PRIMARY KEY (id);

ALTER TABLE public."meta_fetch_attempts" ADD CONSTRAINT "meta_fetch_attempts_pkey" PRIMARY KEY (id);

ALTER TABLE public."meta_fetch_control" ADD CONSTRAINT "meta_fetch_control_pkey" PRIMARY KEY (region);

ALTER TABLE public."price_history" ADD CONSTRAINT "price_history_pkey" PRIMARY KEY (id);

ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_pkey" PRIMARY KEY (visit_id, game_id, attempt);

ALTER TABLE public."content_items" ADD CONSTRAINT "content_items_slug_key" UNIQUE (slug);

ALTER TABLE public."game_reviews" ADD CONSTRAINT "game_reviews_game_id_meta_review_id_key" UNIQUE (game_id, meta_review_id);

ALTER TABLE public."game_videos" ADD CONSTRAINT "game_videos_game_id_youtube_video_id_key" UNIQUE (game_id, youtube_video_id);

ALTER TABLE public."games" ADD CONSTRAINT "games_meta_catalog_item_id_key" UNIQUE (meta_catalog_item_id);

ALTER TABLE public."games" ADD CONSTRAINT "games_meta_product_id_key" UNIQUE (meta_product_id);

ALTER TABLE public."games" ADD CONSTRAINT "games_slug_key" UNIQUE (slug);

ALTER TABLE public."genres" ADD CONSTRAINT "genres_name_key" UNIQUE (name);

ALTER TABLE public."genres" ADD CONSTRAINT "genres_slug_key" UNIQUE (slug);

ALTER TABLE public."products" ADD CONSTRAINT "products_slug_key" UNIQUE (slug);

ALTER TABLE public."content_games" ADD CONSTRAINT "content_games_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE;

ALTER TABLE public."content_games" ADD CONSTRAINT "content_games_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."content_products" ADD CONSTRAINT "content_products_content_id_fkey" FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE;

ALTER TABLE public."content_products" ADD CONSTRAINT "content_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public."game_genres" ADD CONSTRAINT "game_genres_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."game_genres" ADD CONSTRAINT "game_genres_genre_id_fkey" FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE;

ALTER TABLE public."game_media" ADD CONSTRAINT "game_media_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."game_reviews" ADD CONSTRAINT "game_reviews_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."game_videos" ADD CONSTRAINT "game_videos_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."game_visit_refresh" ADD CONSTRAINT "game_visit_refresh_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."horizon_plus_entries" ADD CONSTRAINT "horizon_plus_entries_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;

ALTER TABLE public."meta_fetch_attempts" ADD CONSTRAINT "meta_fetch_attempts_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."meta_fetch_attempts" ADD CONSTRAINT "meta_fetch_attempts_region_fkey" FOREIGN KEY (region) REFERENCES meta_fetch_control(region);

ALTER TABLE public."price_history" ADD CONSTRAINT "price_history_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public."visit_refresh_decisions" ADD CONSTRAINT "visit_refresh_decisions_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

CREATE INDEX games_pricing_type_idx ON public.games USING btree (pricing_type);

CREATE UNIQUE INDEX game_media_game_id_url_key ON public.game_media USING btree (game_id, url);

CREATE INDEX games_release_date_idx ON public.games USING btree (release_date DESC);

CREATE INDEX game_media_game_id_idx ON public.game_media USING btree (game_id);

CREATE INDEX games_admin_new_release_pinned_idx ON public.games USING btree (admin_new_release_pinned DESC, release_date DESC, created_at DESC) WHERE ((active = true) AND (admin_hidden = false));

CREATE INDEX games_price_idx ON public.games USING btree (current_price);

CREATE INDEX horizon_plus_month_category_idx ON public.horizon_plus_entries USING btree (month DESC, category);

CREATE INDEX game_videos_game_id_idx ON public.game_videos USING btree (game_id, active, sort_order);

CREATE INDEX games_motion_sickness_idx ON public.games USING btree (motion_sickness_level);

CREATE INDEX content_type_published_idx ON public.content_items USING btree (content_type, published_at DESC NULLS LAST);

CREATE INDEX game_reviews_game_id_idx ON public.game_reviews USING btree (game_id);

CREATE INDEX games_promo_window_idx ON public.games USING btree (promo_starts_at, promo_ends_at);

CREATE INDEX meta_fetch_attempts_region_time ON public.meta_fetch_attempts USING btree (region, started_at DESC);

CREATE INDEX games_affiliate_discount_sort_idx ON public.games USING btree (affiliate_discount_percent DESC NULLS LAST);

CREATE INDEX products_type_active_idx ON public.products USING btree (product_type, active, sort_order);

CREATE INDEX games_popularity_sort_idx ON public.games USING btree (popularity_score DESC NULLS LAST);

CREATE INDEX game_videos_youtube_id_idx ON public.game_videos USING btree (youtube_video_id);

CREATE INDEX game_genres_genre_idx ON public.game_genres USING btree (genre_id, game_id);

CREATE INDEX games_admin_visible_created_idx ON public.games USING btree (created_at DESC) WHERE ((active = true) AND (admin_hidden = false));

CREATE INDEX games_name_idx ON public.games USING btree (name);

CREATE INDEX games_review_count_sort_idx ON public.games USING btree (review_count DESC NULLS LAST);

CREATE INDEX visit_refresh_decisions_recorded_at_idx ON public.visit_refresh_decisions USING btree (recorded_at);

CREATE INDEX games_rating_sort_idx ON public.games USING btree (rating DESC NULLS LAST);

CREATE INDEX games_release_date_sort_idx ON public.games USING btree (release_date DESC NULLS LAST);

CREATE INDEX price_history_game_checked_idx ON public.price_history USING btree (game_id, checked_at DESC);

CREATE UNIQUE INDEX horizon_plus_unique_game_month_category ON public.horizon_plus_entries USING btree (month, category, game_id) WHERE (game_id IS NOT NULL);

CREATE INDEX games_active_idx ON public.games USING btree (active);

CREATE OR REPLACE FUNCTION public.claim_game_visit_refresh(p_game_id uuid, p_media_expired boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g public.games%rowtype; v public.game_visit_refresh%rowtype; c public.meta_fetch_control%rowtype;
  fetch_region text; token uuid; result jsonb;
begin
  select * into g from public.games where id=p_game_id and active and not admin_hidden;
  if not found then return null; end if;
  fetch_region:=case when g.krw_price is not null then 'KRW' when g.usd_price is not null or g.region_restricted or g.krw_store_available=false then 'USD' else 'KRW' end;
  select * into c from public.meta_fetch_control where region=fetch_region for update;
  if not found then return null; end if;
  select * into v from public.game_visit_refresh where game_id=p_game_id;
  if found and v.daily_attempted_at>now()-interval '24 hours' and not (p_media_expired and v.attempted_at<=now()-interval '1 hour') then return null; end if;
  if p_media_expired then
    -- Visible visitors retry briefly; this demand expires even if they leave.
    update public.meta_fetch_control set media_priority_until=now()+interval '90 seconds' where region=fetch_region;
  elsif c.media_priority_until>now() then
    return null;
  end if;
  token:=public.reserve_meta_fetch(fetch_region,p_game_id,'visit');
  if token is null then return null; end if;
  insert into public.game_visit_refresh(game_id,attempted_at,daily_attempted_at)
    values(p_game_id,now(),now())
  on conflict(game_id) do update set attempted_at=excluded.attempted_at,completed_at=null,outcome=null,
    refresh_daily=public.game_visit_refresh.daily_attempted_at<=now()-interval '24 hours',
    daily_attempted_at=case when public.game_visit_refresh.daily_attempted_at<=now()-interval '24 hours' then now() else public.game_visit_refresh.daily_attempted_at end
  returning jsonb_build_object('attempted_at',attempted_at,'refresh_daily',refresh_daily,'fetch_token',token) into result;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.claim_game_visit_refresh_observed(p_game_id uuid, p_media_expired boolean, p_visit_id uuid, p_attempt integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.claim_game_visit_refresh_unmetered(p_game_id uuid, p_media_expired boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.game_visit_refresh(game_id, attempted_at,daily_attempted_at)
  select id, now(),now() from public.games
  where id=p_game_id and active and not admin_hidden
  on conflict(game_id) do update
    set attempted_at=excluded.attempted_at, completed_at=null, outcome=null,
      refresh_daily=public.game_visit_refresh.daily_attempted_at <= now()-interval '24 hours',
      daily_attempted_at=case when public.game_visit_refresh.daily_attempted_at <= now()-interval '24 hours'
        then now() else public.game_visit_refresh.daily_attempted_at end
    where public.game_visit_refresh.daily_attempted_at <= now() - interval '24 hours'
      or (p_media_expired and public.game_visit_refresh.attempted_at <= now()-interval '1 hour')
  returning jsonb_build_object('attempted_at',attempted_at,'refresh_daily',refresh_daily);
$function$;

CREATE OR REPLACE FUNCTION public.claim_review_translations(p_game_id uuid)
 RETURNS SETOF game_reviews
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update public.game_reviews r set translation_attempted_at = now()
  where r.id in (
    select candidate.id from public.game_reviews candidate
    join public.games g on g.id = candidate.game_id
    where candidate.game_id = p_game_id and candidate.active and g.active and not g.admin_hidden
      and (candidate.translation_attempted_at is null or candidate.translation_attempted_at < now() - interval '24 hours')
      and ((nullif(btrim(candidate.title_original), '') is not null and nullif(btrim(candidate.title_ko), '') is null)
        or (nullif(btrim(candidate.body_original), '') is not null and nullif(btrim(candidate.body_ko), '') is null))
    order by candidate.helpful_count desc nulls last, candidate.reviewed_at desc nulls last, candidate.id
    limit 5 for update of candidate skip locked
  ) returning r.*;
$function$;

CREATE OR REPLACE FUNCTION public.complete_meta_fetch(p_token uuid, p_success boolean, p_blocked boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.meta_fetch_attempts%rowtype; streak int; delay_seconds int;
begin
  if p_success is null then return false; end if;
  select * into a from public.meta_fetch_attempts where id=p_token;
  if not found then return false; end if;
  -- Same lock order as reservations: region, then attempt.
  perform 1 from public.meta_fetch_control where region=a.region for update;
  update public.meta_fetch_attempts set success=p_success where id=p_token and success is null;
  if not found then return false; end if;
  -- An expired worker's late result cannot reset a newer worker's backoff.
  if exists(select 1 from public.meta_fetch_attempts where region=a.region and started_at>a.started_at) then return true; end if;
  if p_success then
    update public.meta_fetch_control set failure_streak=0 where region=a.region;
  else
    update public.meta_fetch_control set failure_streak=least(failure_streak+1,3) where region=a.region returning failure_streak into streak;
    delay_seconds:=case when p_blocked or streak>=3 then 3600 when streak=2 then 300 else 60 end;
    update public.meta_fetch_control set paused_until=greatest(paused_until,clock_timestamp()+make_interval(secs=>delay_seconds)) where region=a.region;
  end if;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.finish_game_visit_refresh(p_game_id uuid, p_attempted_at timestamp with time zone, p_observation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.reserve_meta_fetch(p_region text, p_game_id uuid, p_purpose text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.meta_fetch_control%rowtype; token uuid; recent_failures int;
begin
  -- Every caller takes this regional row lock before checking/reserving a slot.
  select * into c from public.meta_fetch_control where region=p_region for update;
  if not found or c.paused_until > now() then return null; end if;
  -- A crashed worker cannot hold the region forever. Network timeouts are <=25s.
  if exists(select 1 from public.meta_fetch_attempts where region=p_region
    and success is null and started_at>now()-interval '2 minutes') then return null; end if;
  if exists(select 1 from public.meta_fetch_attempts where region=p_region
    and started_at>now()-make_interval(secs=>c.min_interval_seconds)) then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '1 hour') >= c.hourly_limit then return null; end if;
  if (select count(*) from public.meta_fetch_attempts where region=p_region and started_at>now()-interval '24 hours') >= c.daily_limit then return null; end if;
  -- Retain the breaker for old deployments that still PATCH attempt results.
  select count(*) into recent_failures from (
    select a.success,v.outcome from public.meta_fetch_attempts a
    left join public.game_visit_refresh v on a.purpose='visit' and v.game_id=a.game_id and v.attempted_at=a.started_at
    where a.region=p_region and a.started_at>now()-interval '1 hour'
    order by a.started_at desc limit 3
  ) recent where success=false or (success is null and outcome='refresh_failed');
  if recent_failures>=3 then
    update public.meta_fetch_control set paused_until=now()+interval '1 hour' where region=p_region;
    return null;
  end if;
  insert into public.meta_fetch_attempts(region,game_id,purpose) values(p_region,p_game_id,p_purpose) returning id into token;
  return token;
end $function$;

CREATE OR REPLACE FUNCTION public.save_new_release_order(p_ids uuid[], p_expected jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_snapshot jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 10000
    or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id)
    or p_expected is null then
    raise exception 'Invalid order';
  end if;
  -- Serialize order saves; lock pinned rows so pin removal cannot race the save.
  perform pg_catalog.pg_advisory_xact_lock(831725091);
  perform id from public.games where admin_new_release_pinned is true order by id for update;
  select coalesce(jsonb_object_agg(id::text, jsonb_build_object(
    'rank', admin_new_release_order, 'active', active, 'hidden', admin_hidden)), '{}'::jsonb)
    into current_snapshot from public.games where admin_new_release_pinned is true;
  if current_snapshot <> p_expected or
    (select array_agg(k order by k) from jsonb_object_keys(current_snapshot) k) is distinct from
    (select array_agg(id::text order by id::text) from unnest(p_ids) id) then
    raise exception 'Pinned games changed; reload before saving';
  end if;
  update public.games g set admin_new_release_order = o.position::integer - 1,
    updated_at = now()
    from unnest(p_ids) with ordinality as o(id, position) where g.id = o.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE VIEW public."games_storefront" WITH (security_invoker=true) AS
 SELECT id,
    name,
    slug,
    affiliate_url,
    meta_store_url,
    image_path,
    source_image_url,
    current_price,
    original_price,
    currency,
        CASE
            WHEN original_price IS NOT NULL AND original_price > 0::numeric AND current_price IS NOT NULL AND current_price < original_price THEN round((1::numeric - current_price / original_price) * 100::numeric, 2)
            ELSE 0::numeric
        END AS discount_percent,
    rating,
    review_count,
    release_date,
    supports_korean,
    supports_quest_2,
    supports_quest_3,
    supports_quest_3s,
    updated_at
   FROM games g
  WHERE active = true;

CREATE VIEW public."games_current_offer" WITH (security_invoker=true) AS
 SELECT id,
    meta_product_id,
    meta_catalog_id,
    meta_catalog_item_id,
    name,
    slug,
    affiliate_url,
    meta_store_url,
    image_path,
    source_image_url,
    current_price,
    original_price,
    currency,
    description,
    developer,
    publisher,
    release_date,
    rating,
    review_count,
    supports_korean,
    supports_quest_2,
    supports_quest_3,
    supports_quest_3s,
    source_status,
    active,
    created_at,
    updated_at,
    pricing_type,
    affiliate_discount_percent,
    affiliate_discount_active,
    first_iap_discount_percent,
    krw_price,
    usd_price,
    krw_converted_price,
    krw_store_available,
    region_restricted,
    fx_rate_usd_krw,
    price_checked_at,
    motion_sickness_level,
    movement_mode,
    turning_mode,
    seated_supported,
    standing_supported,
    beginner_recommended,
    advanced_recommended,
    zecole_recommended,
    popularity_score,
    base_affiliate_discount_percent,
    promo_affiliate_discount_percent,
    promo_starts_at,
    promo_ends_at,
    promo_label,
        CASE
            WHEN promo_affiliate_discount_percent IS NOT NULL AND (promo_starts_at IS NULL OR promo_starts_at <= now()) AND (promo_ends_at IS NULL OR promo_ends_at >= now()) THEN promo_affiliate_discount_percent
            ELSE COALESCE(base_affiliate_discount_percent, affiliate_discount_percent)
        END AS effective_affiliate_discount_percent,
        CASE
            WHEN promo_affiliate_discount_percent IS NOT NULL AND (promo_starts_at IS NULL OR promo_starts_at <= now()) AND (promo_ends_at IS NULL OR promo_ends_at >= now()) THEN true
            ELSE false
        END AS promotion_active
   FROM games g;

CREATE TRIGGER games_set_updated_at BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER game_videos_set_updated_at BEFORE UPDATE ON game_videos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER content_items_set_updated_at BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "Public can read active videos" ON public."game_videos" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((active = true));

CREATE POLICY "Public can read price history" ON public."price_history" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Public can read genres" ON public."genres" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Public can read game genres" ON public."game_genres" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Public can read active games" ON public."games" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((active = true));

CREATE POLICY "Public can read active products" ON public."products" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active = true));

CREATE POLICY "Public can read active content" ON public."content_items" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((active = true));

CREATE POLICY "Public can read content game links" ON public."content_games" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Public can read content product links" ON public."content_products" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Public can read Horizon Plus catalog" ON public."horizon_plus_entries" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Public read access for active game media" ON public."game_media" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((active = true));

CREATE POLICY "Public read access for active game reviews" ON public."game_reviews" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((active = true));

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

COMMIT;
