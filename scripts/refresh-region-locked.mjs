// scripts/refresh-region-locked.mjs
//
// region_restricted=true 게임(한국 스토어에 없는 게임) 전용 갱신 스크립트 — 지금은
// GitHub Actions 러너에서 직접 실행하는 걸 테스트해보는 버전이다.
//
// ⚠️ 주의: 이 저장소에는 GitHub 러너 IP가 메타에 429를 맞은 전례가 있다(2026-09-05,
// backfill-legacy-thumbnails 초기 버전 — 3초 딜레이로 42분간 약 340건 요청 후 차단,
// IP를 새로 받아도 재발). 그래서 그 이후 썸네일 백필은 Vercel IP를 경유하도록 바꿨다
// (app/api/admin/thumbnail-backfill/route.js 참고). 이 스크립트는 그 결정을 재검토하려고
// 만든 실험용이다 — 20초 딜레이로 30개 테스트는 무차단으로 통과했고(2026-09-09),
// 서울 VPS의 실제 상시 워커와 같은 페이스(기본 60초)로 한 단계 더 보수적으로 맞췄다.
// 차단 신호(429/403)가 보이면 즉시 멈춘다 — 배치를 억지로 끝까지 밀어붙이지 않는다.
//
// 한국 IP가 필요 없다(지역락 게임은 애초에 KRW가 없으므로 어느 지역 통화든 참고용).
//
// 사용법: node scripts/refresh-region-locked.mjs [--limit=290] [--delay-ms=60000]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  relayApp, parseKrw, extractBaseInfo, extractMedia, extractLongDescription,
  translateLongDescription, uploadImageToStorage, resizeStoredImageIfNeeded,
  extractOfferPricing, stripQuery, metaUrlId, sleep,
} from "../lib/meta-collect.mjs";

const root = process.cwd();
const arg = (name, fallback) => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return value == null ? fallback : value;
};
const delayMs = Math.max(5_000, Number(arg("delay-ms", 60_000)));
const limit = Math.max(1, Number(arg("limit", 290)));

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const env = (key) => process.env[key] || localEnv[key];

const SUPABASE_URL = (env("NEXT_PUBLIC_SUPABASE_URL") || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const SECRET_KEY = env("SUPABASE_SECRET_KEY");
const BUCKET = env("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET") || "game-images";
if (!SUPABASE_URL || !SECRET_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");

const restHeaders = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" };
async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...restHeaders, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function refreshOneGame(game) {
  const metaId = metaUrlId(game.meta_product_id);
  const response = await fetch(game.meta_store_url, {
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLECatalogRefresh/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429 || response.status === 403) {
    const blockedError = new Error(`IP 차단 의심 (HTTP ${response.status})`);
    blockedError.blocked = true;
    throw blockedError;
  }
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
      supabaseUrl: SUPABASE_URL, supabaseSecretKey: SECRET_KEY, bucket: BUCKET,
    });
    if (imagePath) {
      gamesPayload.image_path = imagePath;
      gamesPayload.source_image_url = baseInfo.imageUrl;
      summary.push("썸네일 교체됨");
    }
  } else if (game.image_path) {
    const resized = await resizeStoredImageIfNeeded({ path: game.image_path, supabaseUrl: SUPABASE_URL, supabaseSecretKey: SECRET_KEY, bucket: BUCKET });
    if (resized.resized) summary.push(`기존 썸네일 축소됨(${resized.width}x${resized.height})`);
  }

  if (baseInfo.rating != null) gamesPayload.rating = baseInfo.rating;
  if (baseInfo.reviewCount != null) gamesPayload.review_count = baseInfo.reviewCount;

  const media = extractMedia(relay);
  await rest(`game_media?game_id=eq.${game.id}`, { method: "DELETE" });
  if (media.length) {
    const mediaPayload = media.map((m) => ({ game_id: game.id, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store" }));
    await rest("game_media", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(mediaPayload) });
    summary.push(`미디어 ${media.length}개 갱신`);
  }
  const longDescription = extractLongDescription(relay);
  if (longDescription) {
    gamesPayload.description_long = longDescription;
    gamesPayload.description_long_ko = await translateLongDescription(longDescription);
  }

  const parsed = parseKrw(html, metaId, relay);
  const offer = extractOfferPricing(relay);
  if (parsed.found && Number.isFinite(parsed.price) && parsed.currency) {
    const discountPercent = offer.originalPrice && offer.originalPrice > parsed.price
      ? Math.round((1 - parsed.price / offer.originalPrice) * 1000) / 10 : null;
    await rest("price_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        game_id: game.id, current_price: parsed.price, original_price: offer.originalPrice,
        currency: parsed.currency, discount_percent: discountPercent, sale_ends_at: offer.offerEndsAt,
        checked_at: gamesPayload.price_checked_at,
      }),
    });
    summary.push(`price_history 기록(${parsed.currency} ${parsed.price})`);
  }

  await rest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(gamesPayload) });
  return summary;
}

const targets = await rest(
  "games?select=id,name,meta_product_id,meta_store_url,image_path,source_image_url" +
  `&region_restricted=eq.true&order=price_checked_at.asc.nullsfirst&limit=${limit}`
);
console.log(`대상 ${targets.length}개, 딜레이 ${delayMs / 1000}초/개`);

let ok = 0;
let fail = 0;
for (let i = 0; i < targets.length; i++) {
  const game = targets[i];
  const label = `[${i + 1}/${targets.length}]`;
  try {
    const summary = await refreshOneGame(game);
    ok++;
    console.log(`${label} OK ${game.name} -> ${summary.join(", ") || "변경 없음"}`);
  } catch (error) {
    if (error.blocked) {
      console.log(`${label} 중지 ${game.name} -> ${error.message} — 여기서 멈춥니다. (성공 ${ok}, 실패 ${fail})`);
      break;
    }
    fail++;
    console.log(`${label} FAIL ${game.name} -> ${error.message}`);
  }
  if (i < targets.length - 1) await sleep(delayMs);
}
console.log(`=== 완료: 성공 ${ok} / 실패 ${fail} ===`);
