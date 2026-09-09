// scripts/refresh-game-catalog.mjs
//
// 상시 구동 워커: KR 스토어에 정상 노출되는(region_restricted != true) 게임들을 하나씩
// 다시 방문해서 아래 다섯 가지를 갱신한다.
//   1) 썸네일 원본이 바뀌었는지 확인(경로 비교, 쿼리스트링 제외) → 바뀌었으면 재수집
//   2) 우리 Storage에 이미 저장된 썸네일이 필요 이상으로 크면 축소해서 같은 경로에 재저장
//      (메타에 다시 요청하지 않음 — Storage 사본만 내려받아 처리)
//   3) 별점/리뷰 수 갱신 (리뷰 본문 자체는 다시 수집하지 않음)
//   4) 스크린샷/트레일러(game_media) + 게임 설명 인라인 미디어(description_long) 갱신
//      — 메타 CDN 링크는 ~1주일 뒤 서명이 만료되므로 링크 자체를 최신으로 유지하는 목적
//   5) 가격을 확인해서 price_history에 (게임, 그 시점 가격, 확인 시각) 기록 남김
//
// 대상 선정은 games.price_checked_at이 가장 오래된(=한 번도 안 됐거나 가장 늦게 갱신된)
// 게임을 매번 하나씩 다시 조회하는 방식 — 커서/오프셋 상태를 따로 관리할 필요 없이
// 자연스럽게 전체 카탈로그를 돌면서 순환한다. 중단 후 재시작해도 이어서 가장 오래된
// 것부터 계속하면 되므로 안전하다.
//
// 반드시 한국 IP(서울 클라우드 서버)에서 실행할 것 — 가격은 요청 IP의 실제 국가로
// 통화가 결정된다(lib/meta-collect.mjs 상단 주석 참고). 지역락(region_restricted=true)
// 게임은 애초에 한국 스토어에 없어서 이 워커의 대상에서 제외하고, 대신
// app/api/admin/refresh-region-locked/route.js가 Vercel에서 별도로 처리한다.
//
// 사용법: node scripts/refresh-game-catalog.mjs [--delay-ms=60000] [--skip-ip-check] [--once]

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
const delayMs = Math.max(10_000, Number(arg("delay-ms", 60_000)));
const runOnce = process.argv.includes("--once");

// --- IP 국가 확인 (parseKrw는 반드시 한국 IP에서만 정확함) ---
async function assertKoreanIp() {
  if (process.argv.includes("--skip-ip-check")) return;
  try {
    const response = await fetch("https://ipapi.co/country/", { signal: AbortSignal.timeout(8000) });
    const country = (await response.text()).trim();
    if (!/^[A-Z]{2}$/.test(country)) {
      console.log(`IP 국가 확인 응답이 올바르지 않습니다(${country.slice(0, 120)}). 판단 없이 계속 진행합니다.`);
      return;
    }
    if (country !== "KR") throw new Error(`현재 접속 IP 국가가 '${country}'입니다. 한국 IP에서만 실행해야 합니다.`);
    console.log("접속 IP 국가 확인: KR (정상)");
  } catch (error) {
    if (error.message.includes("한국 IP에서만")) throw error;
    console.log(`IP 국가 확인 실패(${error.message}). 판단 없이 계속 진행합니다.`);
  }
}

// --- Supabase 연결 ---
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

async function pickNextGame() {
  const rows = await rest(
    "games?select=id,name,meta_product_id,meta_store_url,image_path,source_image_url,description_long," +
    "krw_price,krw_store_available,region_restricted" +
    "&or=(region_restricted.is.null,region_restricted.eq.false)" +
    "&order=price_checked_at.asc.nullsfirst&limit=1"
  );
  return rows?.[0] || null;
}

async function refreshOneGame(game) {
  const metaId = metaUrlId(game.meta_product_id);
  const response = await fetch(game.meta_store_url, {
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLECatalogRefresh/1.0" },
    signal: AbortSignal.timeout(45_000),
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

  // 1+2) 썸네일: 원본이 바뀌었으면 재수집, 안 바뀌었으면 기존 Storage 사본 크기만 점검
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
    const resized = await resizeStoredImageIfNeeded({
      path: game.image_path, supabaseUrl: SUPABASE_URL, supabaseSecretKey: SECRET_KEY, bucket: BUCKET,
    });
    if (resized.resized) summary.push(`기존 썸네일 축소됨(${resized.width}x${resized.height})`);
  }

  // 3) 별점/리뷰 수 (리뷰 본문 재수집 아님)
  if (baseInfo.rating != null) gamesPayload.rating = baseInfo.rating;
  if (baseInfo.reviewCount != null) gamesPayload.review_count = baseInfo.reviewCount;

  // 4) 스크린샷/트레일러 + 설명 인라인 미디어 — 링크가 만료되기 전에 최신 링크로 교체
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

  // 5) 가격 확인 + price_history 기록
  const parsed = parseKrw(html, metaId, relay);
  const offer = extractOfferPricing(relay);
  const krw = parsed.currency === "KRW" && Number.isFinite(parsed.price);
  const storeResolved = krw || (parsed.found && parsed.available);
  if (storeResolved) {
    gamesPayload.krw_price = krw ? parsed.price : null;
    gamesPayload.krw_store_available = krw;
    gamesPayload.region_restricted = !krw;
    gamesPayload.meta_store_original_price = offer.originalPrice;
    gamesPayload.meta_store_offer_ends_at = offer.offerEndsAt;
    gamesPayload.meta_store_show_timer = offer.showTimer;
  }
  if (krw && Number.isFinite(parsed.price)) {
    const discountPercent = offer.originalPrice && offer.originalPrice > parsed.price
      ? Math.round((1 - parsed.price / offer.originalPrice) * 1000) / 10
      : null;
    await rest("price_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        game_id: game.id,
        current_price: parsed.price,
        original_price: offer.originalPrice,
        currency: "KRW",
        discount_percent: discountPercent,
        sale_ends_at: offer.offerEndsAt,
        checked_at: gamesPayload.price_checked_at,
      }),
    });
    summary.push(`price_history 기록(₩${parsed.price}${discountPercent ? `, -${discountPercent}%` : ""})`);
  }

  await rest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(gamesPayload) });
  return summary;
}

await assertKoreanIp();
console.log(`게임 카탈로그 상시 갱신 워커 시작 (딜레이 ${delayMs / 1000}초)`);

let processed = 0;
let failed = 0;
for (;;) {
  const game = await pickNextGame();
  if (!game) {
    console.log("갱신 대상 게임이 없습니다. 60초 후 다시 확인합니다.");
    await sleep(60_000);
    continue;
  }
  try {
    const summary = await refreshOneGame(game);
    processed += 1;
    console.log(`[${processed}] OK ${game.name} -> ${summary.join(", ") || "변경 없음"}`);
  } catch (error) {
    if (error.blocked) {
      // IP 차단 의심(429/403) — 더 두드리면 상황만 악화되니 즉시 멈춘다. 이 게임의
      // price_checked_at은 건드리지 않아서, 재개했을 때 바로 이 게임부터 다시 시도된다.
      // 정상 종료(exit 0)해야 systemd의 Restart=on-failure가 곧바로 재시작해서 같은
      // 차단에 다시 부딪히는 걸 막는다 — 재개는 사람이 `systemctl start media-refresh`로.
      console.log(`[중지] ${game.name} 처리 중 ${error.message} — 워커를 즉시 정지합니다. (지금까지 성공 ${processed}, 실패 ${failed})`);
      process.exit(0);
    }
    failed += 1;
    console.log(`[실패 ${failed}] ${game.name} -> ${error.message}`);
    // Supabase 요청 자체가 계속 실패하는 상황(자격증명/네트워크 등)이면 무한 루프로
    // 로그만 채우지 않도록, 같은 게임을 건드리기 전에 price_checked_at만이라도 갱신해서
    // 다음 순번으로 넘긴다.
    try {
      await rest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ price_checked_at: new Date().toISOString() }) });
    } catch { /* 이것마저 실패하면 다음 루프에서 같은 게임을 다시 시도하게 된다 */ }
  }
  if (runOnce) break;
  await sleep(delayMs);
}
