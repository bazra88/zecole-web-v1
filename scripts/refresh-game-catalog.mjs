// scripts/refresh-game-catalog.mjs
//
// crontab이 고정 시각마다 한 번씩 깨워서 실행하는 배치(상시 루프 아님) — KR 스토어에
// 정상 노출되는(region_restricted != true) 게임을 최대 --limit개까지 하나씩 다시
// 방문해서 아래 다섯 가지를 갱신하고 종료한다.
//   1) 썸네일 원본이 바뀌었는지 확인(경로 비교, 쿼리스트링 제외) → 바뀌었으면 재수집
//   2) 우리 Storage에 이미 저장된 썸네일이 필요 이상으로 크면 축소해서 같은 경로에 재저장
//      (메타에 다시 요청하지 않음 — Storage 사본만 내려받아 처리)
//   3) 별점/리뷰 수 갱신 (리뷰 본문 자체는 다시 수집하지 않음)
//   4) 스크린샷/트레일러(game_media) + 게임 설명 인라인 미디어(description_long) 갱신
//      — 메타 CDN 서명 링크는 실측 결과 4~5일이면 만료된다(2026-09-23, 7일이라던 이전
//      가정이 틀렸음을 확인). 그래서 스크린샷은 썸네일처럼 자체 Storage에 다운로드해
//      영구 저장하고(persistMedia), 트레일러(평균 ~12MB, 전부 저장하면 수십 GB)는 포스터
//      이미지만 저장한 뒤 재생 시점에 app/api/media/trailer/route.js가 온디맨드로 최신
//      링크를 다시 조회한다 — 이 방식은 반복 배치로 전체를 도는 게 아니라 실제 클릭에만
//      비례해서 메타에 요청하므로 대신 아주 가볍다.
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
// ⚠️ 차단 문턱값 실험 결과(2026-09-12~14): 상시 루프+내부 쿨다운(세션 200개마다 4시간
// setTimeout 재개) 방식은 1,065개/31h22m에서 차단. crontab 고정 스케줄(00/06/12/18시,
// 세션 200개)로 바꿔도 1,130개/37h11m에서 또 차단 — 시간당 처리량은 오히려 더
// 낮았는데도 비슷한 총량에서 막혀서, "세션 크기"나 "쿨다운/간격 길이"보다는 어떤
// 기간(하루~하루반) 동안의 누적 요청 총량 자체가 문턱값(대략 1,000~1,100개대)에
// 가까워 보인다. 그래서 몇 달간 무차단으로 검증됐던 KRW 배치 크론의 원래 조합
// (150개/6시간 간격)으로 되돌렸다 — deploy/run-media-refresh-batch.sh 참고.
//
// 사용법: node scripts/refresh-game-catalog.mjs --limit=150 [--delay-ms=20000] [--jitter-ms=10000] [--skip-ip-check]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  relayApp, parseKrw, extractBaseInfo, extractMedia, extractLongDescription,
  translateLongDescription, uploadImageToStorage, resizeStoredImageIfNeeded, persistMedia,
  extractOfferPricing, stripQuery, metaUrlId, sleep,
} from "../lib/meta-collect.mjs";
import { sendKakaoNotification } from "../lib/kakao-notify.mjs";

const root = process.cwd();
const arg = (name, fallback) => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return value == null ? fallback : value;
};
const delayMs = Math.max(10_000, Number(arg("delay-ms", 20_000)));
const jitterMs = Math.max(0, Number(arg("jitter-ms", 10_000)));
const limit = Math.max(1, Number(arg("limit", 150)));
// KRW 배치 크론(20초 기본 + 0~4초 랜덤)이 몇 달간 무차단으로 버텼던 걸 감안해서, 일정한
// 간격 대신 매번 조금씩 다른 딜레이를 준다(2026-09-21, 사용자 요청 — 고정 간격 자체가
// 봇처럼 보였을 가능성 검증).
const nextDelay = () => delayMs + Math.floor(Math.random() * jitterMs);

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
// Supabase 쪽 일시적 오류(5xx, 네트워크 끊김/타임아웃)만 짧게 재시도한다 — 4xx는 재시도해도
// 똑같이 실패할 요청 자체의 문제라 바로 포기한다. 이 재시도가 없으면 순간적인 504 하나가
// (특히 게임별 try/catch 바깥에 있는 pickNextGame 호출에서 나면) 배치 전체를 중단시킨다
// (2026-09-13, 하루에 두 번 이렇게 배치가 통째로 날아가는 걸 보고 추가).
const RETRYABLE_DELAYS_MS = [2000, 5000];
async function rest(path, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRYABLE_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...restHeaders, ...options.headers } });
      if (response.ok) {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }
      const bodyText = (await response.text()).slice(0, 500);
      if (response.status < 500) throw new Error(`Supabase 요청 실패 (${response.status}): ${bodyText}`);
      lastError = new Error(`Supabase 요청 실패 (${response.status}): ${bodyText}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < RETRYABLE_DELAYS_MS.length) {
      console.log(`[재시도 ${attempt + 1}/${RETRYABLE_DELAYS_MS.length}] Supabase 요청 실패, ${RETRYABLE_DELAYS_MS[attempt] / 1000}초 후 재시도: ${lastError.message}`);
      await sleep(RETRYABLE_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
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

  // 4) 스크린샷/트레일러 + 설명 인라인 미디어 — 스크린샷은 썸네일처럼 자체 Storage에
  // 다운로드해서 영구 저장(persistMedia)하고, 트레일러는 용량 문제로 포스터만 저장한 뒤
  // 원본 링크는 그대로 둔다(실제 재생은 app/api/media/trailer/route.js가 온디맨드로 처리).
  const rawMedia = extractMedia(relay);
  const media = await persistMedia(rawMedia, { metaId, supabaseUrl: SUPABASE_URL, supabaseSecretKey: SECRET_KEY, bucket: BUCKET });
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
console.log(`게임 카탈로그 배치 갱신 시작 (딜레이 ${delayMs / 1000}~${(delayMs + jitterMs) / 1000}초 랜덤, 최대 ${limit}개, 이번 실행 후 종료 — 다음 스케줄은 crontab이 담당)`);

// 429 감지 외에 정말 예상 못 한 오류(uncaught exception 등)로 죽는 경우도 조용히
// 넘어가지 않도록 알림을 보낸다.
process.on("uncaughtException", async (error) => {
  console.log(`[치명적 오류] ${error.message}`);
  await sendKakaoNotification(`[zecole 알림] media-refresh 배치가 예상치 못한 오류로 종료됐어요.\n${error.message}`);
  process.exit(1);
});

let processed = 0;
let failed = 0;
for (let i = 0; i < limit; i++) {
  let game;
  try {
    game = await pickNextGame();
  } catch (error) {
    // rest()가 이미 재시도까지 다 해본 뒤라, 여기서 또 실패했다는 건 좀 더 오래가는
    // 문제라는 뜻이다 — 그래도 배치 전체를 죽이는 대신 이번 실행은 여기서 조용히
    // 끝낸다(다음 crontab 스케줄에 이어서 시도됨).
    console.log(`[중단] 다음 게임을 고르는 중 오류 -> ${error.message}`);
    break;
  }
  if (!game) {
    console.log("갱신 대상 게임이 없습니다. 종료합니다.");
    break;
  }
  try {
    const summary = await refreshOneGame(game);
    processed += 1;
    console.log(`[${processed}] OK ${game.name} -> ${summary.join(", ") || "변경 없음"}`);
  } catch (error) {
    if (error.blocked) {
      // IP 차단 의심(429/403) — 더 두드리면 상황만 악화되니 즉시 멈추고 이번 실행을
      // 끝낸다. 이 게임의 price_checked_at은 건드리지 않아서, 다음 crontab 실행 때
      // 바로 이 게임부터 다시 시도된다.
      console.log(`[중지] ${game.name} 처리 중 ${error.message} — 이번 실행을 여기서 끝냅니다. (성공 ${processed}, 실패 ${failed})`);
      await sendKakaoNotification(
        `[zecole 알림] media-refresh 배치가 IP 차단(${error.message})으로 중단됐어요.\n` +
        `${game.name} 처리 중 발생, 이번 실행 성공 ${processed}건.\n` +
        `다음 crontab 스케줄(00/06/12/18시)에 자동으로 재시도됩니다.`
      );
      break;
    }
    failed += 1;
    console.log(`[실패 ${failed}] ${game.name} -> ${error.message}`);
    // Supabase 요청 자체가 계속 실패하는 상황(자격증명/네트워크 등)이면 같은 게임을
    // 계속 붙잡지 않도록, 다음 시도 전에 price_checked_at만이라도 갱신해서 다음
    // 순번으로 넘긴다.
    try {
      await rest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ price_checked_at: new Date().toISOString() }) });
    } catch { /* 이것마저 실패하면 다음 실행에서 같은 게임을 다시 시도하게 된다 */ }
  }
  if (i < limit - 1) await sleep(nextDelay());
}
console.log(`=== 완료: 성공 ${processed} / 실패 ${failed} ===`);
