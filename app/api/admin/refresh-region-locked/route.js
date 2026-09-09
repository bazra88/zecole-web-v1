// app/api/admin/refresh-region-locked/route.js
//
// region_restricted=true 게임(한국 스토어에 애초에 없는 게임)은 서울 VPS 워커
// (scripts/refresh-game-catalog.mjs)의 대상에서 제외된다 — 어차피 KRW 가격이 나올 리
// 없으니 한국 IP가 필요 없고, 대신 이 엔드포인트가 Vercel에서 직접 처리한다.
// 썸네일/미디어/별점/설명은 서울 워커와 동일하게 갱신하고, 가격은 확인되는 통화(대부분
// USD) 그대로 price_history에 기록한다 — krw_store_available/region_restricted 값은
// (이 게임들은 한국에 없으므로) 사실상 항상 그대로 유지된다.
//
// .github/workflows/region-locked-refresh-cron.yml이 몇 분마다 이 엔드포인트를
// 호출해서 조금씩 진행시킨다(thumbnail-backfill/route.js와 같은 패턴).

import { NextResponse } from "next/server";
import { adminRest } from "@/lib/admin-supabase";
import {
  relayApp, parseKrw, extractBaseInfo, extractMedia, extractLongDescription,
  translateLongDescription, uploadImageToStorage, resizeStoredImageIfNeeded,
  extractOfferPricing, stripQuery, metaUrlId, sleep,
} from "@/lib/meta-collect.mjs";

export const maxDuration = 280;
export const dynamic = "force-dynamic";

async function refreshOneGame(game) {
  const metaId = metaUrlId(game.meta_product_id);
  const response = await fetch(game.meta_store_url, {
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLECatalogRefresh/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`페이지 요청 실패 (${response.status})`);
  const html = await response.text();
  const relay = relayApp(html, metaId);
  if (!relay) throw new Error("relay 데이터를 찾지 못함");

  const gamesPayload = { price_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const summary = [];

  const baseInfo = extractBaseInfo(html, relay, metaId);
  const newImagePath = stripQuery(baseInfo.imageUrl);
  const oldImagePath = stripQuery(game.source_image_url);
  if (baseInfo.imageUrl && newImagePath !== oldImagePath) {
    const imagePath = await uploadImageToStorage({
      imageUrl: baseInfo.imageUrl, path: `images/${metaId}.webp`,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
      bucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images",
    });
    if (imagePath) {
      gamesPayload.image_path = imagePath;
      gamesPayload.source_image_url = baseInfo.imageUrl;
      summary.push("썸네일 교체됨");
    }
  } else if (game.image_path) {
    const resized = await resizeStoredImageIfNeeded({
      path: game.image_path, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
      bucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images",
    });
    if (resized.resized) summary.push(`기존 썸네일 축소됨(${resized.width}x${resized.height})`);
  }

  if (baseInfo.rating != null) gamesPayload.rating = baseInfo.rating;
  if (baseInfo.reviewCount != null) gamesPayload.review_count = baseInfo.reviewCount;

  const media = extractMedia(relay);
  await adminRest(`game_media?game_id=eq.${game.id}`, { method: "DELETE" });
  if (media.length) {
    const mediaPayload = media.map((m) => ({ game_id: game.id, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store" }));
    await adminRest("game_media", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(mediaPayload) });
    summary.push(`미디어 ${media.length}개 갱신`);
  }
  const longDescription = extractLongDescription(relay);
  if (longDescription) {
    gamesPayload.description_long = longDescription;
    gamesPayload.description_long_ko = await translateLongDescription(longDescription);
  }

  // 지역락 게임은 한국 스토어에 없으므로 krw_store_available/region_restricted는 건드리지
  // 않는다 — 여기서 잡히는 가격은 어느 지역 통화든(대부분 USD) 참고용으로만 기록한다.
  const parsed = parseKrw(html, metaId, relay);
  const offer = extractOfferPricing(relay);
  if (parsed.found && Number.isFinite(parsed.price) && parsed.currency) {
    const discountPercent = offer.originalPrice && offer.originalPrice > parsed.price
      ? Math.round((1 - parsed.price / offer.originalPrice) * 1000) / 10
      : null;
    await adminRest("price_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        game_id: game.id,
        current_price: parsed.price,
        original_price: offer.originalPrice,
        currency: parsed.currency,
        discount_percent: discountPercent,
        sale_ends_at: offer.offerEndsAt,
        checked_at: gamesPayload.price_checked_at,
      }),
    });
    summary.push(`price_history 기록(${parsed.currency} ${parsed.price}${discountPercent ? `, -${discountPercent}%` : ""})`);
  }

  await adminRest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(gamesPayload) });
  return summary;
}

export async function POST(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.IMPORT_API_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 5, 1), 30);
  const delayMs = Math.max(Number(body.delayMs) || 3000, 1000);

  const candidates = await adminRest(
    "games?select=id,name,meta_product_id,meta_store_url,image_path,source_image_url" +
    `&region_restricted=eq.true&order=price_checked_at.asc.nullsfirst&limit=${batchSize}`
  );

  const deadline = Date.now() + (maxDuration - 20) * 1000;
  const results = [];
  for (const game of candidates || []) {
    if (Date.now() > deadline) break;
    try {
      const summary = await refreshOneGame(game);
      results.push({ id: game.id, name: game.name, ok: true, summary });
    } catch (error) {
      results.push({ id: game.id, name: game.name, ok: false, error: error.message });
    }
    await sleep(delayMs);
  }

  const remaining = await adminRest("games?select=id&region_restricted=eq.true&limit=1");

  return NextResponse.json({ processed: results.length, results, remaining_exists: Boolean(remaining?.length) });
}
