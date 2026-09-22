import "server-only";
import { adminRest } from "./admin-supabase";
import {
  relayApp, extractMedia, persistMedia, metaUrlId,
  extractBaseInfo, extractDeviceInfo, extractLongDescription, translateLongDescription,
  extractReviews, translateText,
} from "./meta-collect.mjs";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images";

function isSelfHosted(url) {
  return typeof url === "string" && SUPABASE_URL && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);
}

// 게임 상세페이지(app/games/[slug]/page.js)를 실제로 여는 방문자가 있을 때만, 그 게임의
// 스크린샷이 아직 자체저장 안 됐으면(메타 CDN 원본 링크 그대로면) 그 순간 한 번 페이지를
// 다시 조회해서 스크린샷은 Storage에 영구 저장하고, 같은 호출로 이미 받아온 relay
// 데이터에서 IP(국가)와 무관한 나머지 정보(평점/리뷰수/기기지원/설명/유저리뷰 원문+번역)도
// 같이 채운다 — 어차피 페이지 하나를 다시 열어보는 거라 요청을 늘리지 않는다(2026-09-23,
// 사용자 요청: "어차피 IP 하나 호출하는거 아녀?").
//
// ⚠️ 가격/통화(krw_price, currency, region_restricted 등)는 절대 여기서 건드리지 않는다.
// parseKrw는 요청 IP의 실제 국가로 통화가 정해지는데, 이 함수는 Vercel(미국 IP)에서
// 실행되므로 여기서 가격을 읽으면 USD가 KRW로 잘못 반영된다 — 가격 갱신은 여전히
// 서울 VPS(한국 IP) 몫이다(lib/meta-collect.mjs 상단 주석 참고).
//
// 이 페이지가 revalidate=300 ISR이라, 한 번 자체저장되고 나면 그 뒤 재검증 때마다
// needsBackfill이 false라 그냥 건너뛰고, 인기 게임은 사실상 최초 방문자 한 명만 로딩을
// 감수하고 그 뒤로는 계속 캐시된 페이지가 나간다.
export async function ensureGameDetailCached(game, media) {
  const screenshots = media.filter((item) => item.media_type === "screenshot");
  const needsBackfill = screenshots.some((item) => !isSelfHosted(item.url));
  if (!needsBackfill || !game?.meta_store_url || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return { media, gamesPatch: {} };
  }

  try {
    const metaId = metaUrlId(game.meta_product_id);
    const response = await fetch(game.meta_store_url, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
        "User-Agent": "Mozilla/5.0 ZECOLEMediaBackfill/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { media, gamesPatch: {} };
    const html = await response.text();
    const relay = relayApp(html, metaId);
    if (!relay) return { media, gamesPatch: {} };

    const rawMedia = extractMedia(relay);
    let persistedMedia = media;
    if (rawMedia.length) {
      persistedMedia = await persistMedia(rawMedia, { metaId, supabaseUrl: SUPABASE_URL, supabaseSecretKey: SUPABASE_SECRET_KEY, bucket: BUCKET });
      await adminRest(`game_media?game_id=eq.${game.id}`, { method: "DELETE" });
      await adminRest("game_media", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(persistedMedia.map((m) => ({
          game_id: game.id, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store",
        }))),
      });
    }

    // 평점/리뷰수/기기지원/설명 — 전부 IP 무관, 가격 필드는 절대 포함하지 않는다.
    const baseInfo = extractBaseInfo(html, relay, metaId);
    const deviceInfo = extractDeviceInfo(relay);
    const longDescription = extractLongDescription(relay);

    const gamesPatch = { updated_at: new Date().toISOString() };
    if (baseInfo.rating != null) gamesPatch.rating = baseInfo.rating;
    if (baseInfo.reviewCount != null) gamesPatch.review_count = baseInfo.reviewCount;
    if (deviceInfo.developer) Object.assign(gamesPatch, deviceInfo);
    if (longDescription && longDescription !== game.description_long) {
      gamesPatch.description_long = longDescription;
      gamesPatch.description_long_ko = await translateLongDescription(longDescription);
    }
    await adminRest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(gamesPatch) });

    // 유저 리뷰 원문 + 번역 — 이미 있는 리뷰(meta_review_id)는 건너뛰어 중복 번역하지 않는다.
    const existingReviews = await adminRest(`game_reviews?select=meta_review_id&game_id=eq.${game.id}`);
    const existingIds = new Set((existingReviews || []).map((r) => r.meta_review_id));
    const newReviews = extractReviews(relay).filter((r) => !existingIds.has(r.meta_review_id));
    for (const review of newReviews) {
      review.title_ko = review.title_original ? await translateText(review.title_original) : null;
      review.body_ko = review.body_original ? await translateText(review.body_original) : null;
    }
    if (newReviews.length) {
      await adminRest("game_reviews?on_conflict=game_id,meta_review_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(newReviews.map((r) => ({
          game_id: game.id, meta_review_id: r.meta_review_id, reviewer_label: r.reviewer_label,
          rating: r.rating, title_original: r.title_original, body_original: r.body_original,
          title_ko: r.title_ko, body_ko: r.body_ko, helpful_count: r.helpful_count,
          reviewed_at: r.reviewed_at, source: "meta_store",
        }))),
      });
    }

    return { media: persistedMedia, gamesPatch };
  } catch (error) {
    console.error(`[ensureGameDetailCached] ${game?.slug || game?.id} 백필 실패:`, error);
    return { media, gamesPatch: {} }; // 실패하면 기존 값 그대로 보여준다
  }
}
