import "server-only";
import { adminRest } from "./admin-supabase";
import { relayApp, extractMedia, persistMedia, metaUrlId } from "./meta-collect.mjs";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images";

function isSelfHosted(url) {
  return typeof url === "string" && SUPABASE_URL && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);
}

// 게임 상세페이지(app/games/[slug]/page.js)를 실제로 여는 방문자가 있을 때만, 그 게임의
// 스크린샷이 아직 자체저장 안 됐으면(메타 CDN 원본 링크 그대로면) 그 순간 한 번 다운로드해서
// Storage에 영구 저장한다. 배치로 전체 카탈로그를 도는 대신 실제로 조회되는 게임만 그때그때
// 캐싱하는 방식 — 이 페이지가 revalidate=300 ISR이라, 한 번 자체저장되고 나면 그 뒤 재검증
// 때마다 needsBackfill이 false라 그냥 건너뛰고, 인기 게임은 사실상 최초 방문자 한 명만
// 로딩을 감수하고 그 뒤로는 계속 캐시된 페이지가 나간다(2026-09-23, 사용자 요청).
export async function ensureGameMediaCached(game, media) {
  const screenshots = media.filter((item) => item.media_type === "screenshot");
  const needsBackfill = screenshots.some((item) => !isSelfHosted(item.url));
  if (!needsBackfill || !game?.meta_store_url || !SUPABASE_URL || !SUPABASE_SECRET_KEY) return media;

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
    if (!response.ok) return media;
    const html = await response.text();
    const relay = relayApp(html, metaId);
    const rawMedia = relay ? extractMedia(relay) : [];
    if (!rawMedia.length) return media;

    const persisted = await persistMedia(rawMedia, { metaId, supabaseUrl: SUPABASE_URL, supabaseSecretKey: SUPABASE_SECRET_KEY, bucket: BUCKET });

    await adminRest(`game_media?game_id=eq.${game.id}`, { method: "DELETE" });
    await adminRest("game_media", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(persisted.map((m) => ({
        game_id: game.id, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store",
      }))),
    });
    return persisted;
  } catch {
    return media; // 실패하면 기존(만료됐을 수도 있는) 링크라도 그대로 보여준다
  }
}
