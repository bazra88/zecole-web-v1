// scripts/sync-meta-recent-krw.mjs
//
// 통합 수집기: 게임 하나당 메타스토어 KR 페이지를 "한 번만" 요청해서
//   1) KRW 가격 / 지역락 여부 / 출시일  → games 테이블
//   2) 트레일러 / 스크린샷            → game_media 테이블
//   3) 개발자 설명 원문(영문) + 번역   → games.description_long / description_long_ko
//   4) 유저 리뷰 원문 + 번역(작성자는 "리뷰어 A/B/..."로 익명화) → game_reviews 테이블
// 을 동시에 파싱해서 반영한다. (요청을 두 번 나눠 하지 않음 — 토큰/요청 비용 절약)
// 번역은 Claude가 직접 하지 않고, 브라우저 확장 수준의 무료 구글 번역 엔드포인트
// (translate.googleapis.com)를 호출해서 처리한다 (translateText() 참고).
//
// ⚠️ 중요: 메타스토어는 URL 경로(/ko-kr/)가 아니라 "요청을 보내는 IP의 실제 국가"로
// 페이지 통화/언어를 결정한다. 이 스크립트는 반드시 한국 IP(코덱스 로컬 실행 등)에서
// 돌려야 하며, 실행 시작 시 실제 접속 국가를 자동으로 확인해서 KR이 아니면 중단한다.
//
// 트레일러/스크린샷/설명/리뷰 필드명은 2026-09-02에 --inspect=<meta_product_id>로
// 실제 relay 객체를 까서 확인·확정함 (extractMedia/extractLongDescription/extractReviews
// 참고). relay 데이터는 페이지 안 여러 <script> JSON 블록에 나뉘어 있어서 relayApp()이
// 그 블록들을 병합해서 하나의 객체로 만든다 (한 블록만 보면 일부 필드가 누락됨).
// 향후 메타가 구조를 바꾸면 같은 방법으로 재확인할 것.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const reportDir = resolve(root, "data", "meta-recent");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_META_RECENT_KRW");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_META_RECENT_KRW가 필요합니다.");

const arg = (name, fallback) => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return value == null ? fallback : value;
};

// scope=recent(기본): source_status가 official_meta_recent_overseas:*인 게임만 대상(기존과 동일).
// scope=all: source_status 필터 없이, krw/release_date가 비어있는 활성 게임 전체를 대상으로 잡는다.
const scope = arg("scope", "recent");
if (!["recent", "all"].includes(scope)) throw new Error("scope은 recent 또는 all이어야 합니다.");

const limit = Math.max(1, Number(arg("limit", 60)));
const delayMs = Math.max(5000, Number(arg("delay-ms", 20000)));
const maxAttempts = Math.max(1, Number(arg("attempts", 3)));
const inspectId = arg("inspect", null);

// --- IP 국가 확인 ---
async function assertKoreanIp() {
  if (process.argv.includes("--skip-ip-check")) return;
  try {
    const response = await fetch("https://ipapi.co/country/", { signal: AbortSignal.timeout(8000) });
    const country = (await response.text()).trim();
    if (!/^[A-Z]{2}$/.test(country)) {
      // ipapi.co가 rate-limit 등으로 JSON 에러 본문을 반환하는 경우 — 국가가 아니라 API 실패이므로 차단하지 않는다.
      console.log(`IP 국가 확인 응답이 올바른 국가 코드가 아닙니다(${country.slice(0, 120)}). 판단 없이 계속 진행합니다 — 결과를 반드시 육안으로 검토하세요.`);
      return;
    }
    if (country !== "KR") {
      throw new Error(
        `현재 접속 IP의 국가가 '${country}'로 감지됐습니다. 이 스크립트는 반드시 한국 IP에서 실행해야 합니다. ` +
        `(정말 알고 실행하는 경우에만 --skip-ip-check 플래그로 이 검사를 건너뛸 수 있습니다.)`
      );
    }
    console.log("접속 IP 국가 확인: KR (정상)");
  } catch (error) {
    if (error.message.includes("감지됐습니다")) throw error;
    console.log(`IP 국가 확인에 실패했습니다(${error.message}). 판단 없이 계속 진행합니다 — 결과를 반드시 육안으로 검토하세요.`);
  }
}

// --- Supabase 연결 ---
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SECRET_KEY;
const key = apply ? secretKey : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// --- 파싱 유틸 ---
// games.meta_product_id는 두 형식이 섞여있다: 순수 숫자("5767635983306831")와
// 카탈로그 접두어가 붙은 형식("product_35505_5767635983306831"). 실제 메타스토어
// URL과 relay 객체의 id는 항상 마지막 숫자 부분만 쓴다(2026-09-02, 실전 반영 중
// 접두어 형식 3,786건이 전부 404가 나서 발견 — meta_store_url 컬럼과 대조해 확인함).
const metaUrlId = (value) => String(value).split("_").pop();
const normalizedDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const korean = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
};
function relayApp(html, metaId) {
  // 같은 게임(app_store_item)의 필드가 페이지 안 여러 JSON 블록에 나뉘어 실려있어서
  // (예: 가격/미디어는 한 블록, 설명은 다른 블록, 리뷰는 또 다른 블록) 하나만 골라잡으면
  // 안 되고 매칭되는 블록을 전부 병합해야 한다. 이미 채워진 필드는 덮어쓰지 않는다.
  const merged = {};
  let found = false;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const id = String(value.id || "");
      const looksLikeApp = (id === metaId || (!id && value.__isAppStoreItem === "Application")) &&
        (value.release_info || value.current_offer || value.display_name || value.display_long_description || value.user_reviews2);
      if (looksLikeApp) {
        found = true;
        for (const [key, val] of Object.entries(value)) {
          if (merged[key] === undefined || merged[key] === null) merged[key] = val;
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  return found ? merged : null;
}
function parseKrw(html, metaId, relay) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      const offer = Array.isArray(app?.offers) ? app.offers[0] : app?.offers;
      if (!app) continue;
      const availability = offer?.availability || null;
      return {
        found: true,
        currency: offer?.priceCurrency || null,
        price: offer?.price == null ? null : Number(offer.price),
        available: /InStock|PreOrder/i.test(offer?.availability || "") || offer?.price != null,
        preorder: /PreOrder/i.test(availability || "") || (relay?.pre_order_bundles?.length || 0) > 0,
        release_date: normalizedDate(app?.datePublished || app?.releaseDate || relay?.release_info?.display_date),
      };
    } catch {}
  }
  const currency = relay?.current_offer?.price?.currency || null;
  const amount = Number(relay?.current_offer?.price?.offset_amount);
  const price = Number.isFinite(amount) ? amount / 100 : null;
  return {
    found: Boolean(relay), currency, price, available: Boolean(relay?.current_offer),
    preorder: (relay?.pre_order_bundles?.length || 0) > 0,
    release_date: normalizedDate(relay?.release_info?.display_date),
  };
}
// 필드명은 --inspect=<meta_product_id>로 실제 relay 데이터를 까본 뒤 확정한 값:
//   relay.screenshots / relay.screenshotsThumbnail → 둘 다 { uri } 객체의 배열, 같은 순서로 짝지어짐
//   relay.trailer → 단일 객체 { uri, thumbnail: { uri } } (배열 아님, 게임당 트레일러 최대 1개)
function extractMedia(relay) {
  if (!relay) return [];
  const media = [];
  const screenshots = Array.isArray(relay.screenshots) ? relay.screenshots : [];
  const screenshotThumbs = Array.isArray(relay.screenshotsThumbnail) ? relay.screenshotsThumbnail : [];
  screenshots.forEach((item, index) => {
    const url = item?.uri;
    if (url) media.push({ media_type: "screenshot", url, thumbnail_url: screenshotThumbs[index]?.uri || null, sort_order: index });
  });
  const trailerUrl = relay.trailer?.uri;
  if (trailerUrl) {
    media.push({ media_type: "trailer", url: trailerUrl, thumbnail_url: relay.trailer?.thumbnail?.uri || null, sort_order: 0 });
  }
  return media;
}

// 무료 구글 번역(브라우저 확장이 쓰는 것과 같은 비공식 엔드포인트, API 키 불필요).
// 정식 Cloud Translation API가 아니므로 대량/고빈도 호출 시 차단될 수 있어 호출 간
// 짧은 지연을 둔다. 실패하면 null을 반환하고 원문은 그대로 보존한다(번역 실패가
// 가격/미디어 수집을 막지 않도록).
async function translateText(text, target = "ko") {
  if (!text || !text.trim()) return null;
  const chunks = text.length > 4000 ? text.split(/\n{2,}/) : [text];
  const translated = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) { translated.push(chunk); continue; }
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}&dt=t&q=${encodeURIComponent(chunk)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return null;
      const data = await response.json();
      translated.push((data?.[0] || []).map((part) => part?.[0] || "").join(""));
      if (chunks.length > 1) await sleep(300);
    } catch {
      return null;
    }
  }
  return translated.join("\n\n");
}

// 원문 설명 중간중간에 인라인 이미지/영상 마크다운(![{"type":"image"|"video",...}](url))이
// 끼어있다 — 개발자가 설명 안에 직접 배치한 스크린샷/영상으로, game_media의 대표
// 트레일러/스크린샷과는 별개(URL이 다름)라 그대로 살려서 상세페이지에 인라인으로 보여준다.
function extractLongDescription(relay) {
  const text = relay?.display_long_description;
  if (typeof text !== "string" || !text.trim()) return null;
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// 인라인 이미지/영상 마크다운은 URL이라 번역기에 그대로 넣으면 URL 중간에 공백이 끼어
// 깨진다. 마크다운 부분은 그대로 두고 그 사이의 실제 문장만 나눠서 번역한 뒤 원래
// 순서대로 다시 이어붙인다 — 번역은 텍스트만, 미디어 위치와 URL은 100% 원문 그대로.
async function translateLongDescription(text) {
  // 구글 번역이 조각마다 앞뒤 공백/줄바꿈을 잘라내므로, 원문의 줄바꿈에 기대지 않고
  // 조각마다 trim한 뒤 "\n\n"으로 명시적으로 다시 이어붙인다.
  const parts = text.split(/(!\[[^\]]*\]\([^)]*\))/g).map((part) => part.trim()).filter(Boolean);
  const translated = [];
  for (const part of parts) {
    translated.push(/^!\[[^\]]*\]\([^)]*\)$/.test(part) ? part : (await translateText(part)) ?? part);
  }
  return translated.join("\n\n");
}

// relay.comfort_rating 실제 관측값(2026-09-02, 다양한 장르 14개 게임 샘플링) 기준 매핑.
// 메타 공식 도움말도 실질적으로 3단계(편안함/보통/움직임 많음)로 설명하고 있어서,
// 5단계 라벨 중 1/3/5에만 매핑하고 2·4는 비워둔다(장래에 새 값이 나오면 COMFORT_LEVEL_MAP에
// 없는 값으로 콘솔에 경고가 찍히니 그때 다시 확인).
//   COMFORTABLE_FOR_MOST → 1 (아주 적음), COMFORTABLE_FOR_SOME → 3 (보통), COMFORTABLE_FOR_FEW → 5 (많음)
const COMFORT_LEVEL_MAP = { COMFORTABLE_FOR_MOST: 1, COMFORTABLE_FOR_SOME: 3, COMFORTABLE_FOR_FEW: 5 };

// 개발사/퍼블리셔/기기 호환성/한국어 지원/멀미유발요소 — --inspect로 확인한 relay 실제 필드명 기준.
function extractDeviceInfo(relay) {
  if (!relay) return {};
  const platforms = Array.isArray(relay.supported_platforms_i18n) ? relay.supported_platforms_i18n : [];
  const modes = Array.isArray(relay.supported_player_modes) ? relay.supported_player_modes : [];
  const languages = Array.isArray(relay.supported_in_app_languages) ? relay.supported_in_app_languages.map((l) => l?.name) : [];
  let motionSicknessLevel = null;
  if (relay.comfort_rating) {
    motionSicknessLevel = COMFORT_LEVEL_MAP[relay.comfort_rating] ?? null;
    if (motionSicknessLevel == null) console.log(`알 수 없는 comfort_rating 값 발견: "${relay.comfort_rating}" — COMFORT_LEVEL_MAP 갱신 필요`);
  }
  return {
    developer: relay.developer_name || null,
    publisher: relay.publisher_name || null,
    supports_quest_2: platforms.length ? platforms.includes("Meta Quest 2") : null,
    supports_quest_3: platforms.length ? platforms.includes("Meta Quest 3") : null,
    supports_quest_3s: platforms.length ? platforms.includes("Meta Quest 3S") : null,
    supports_korean: languages.length ? languages.includes("한국어") : null,
    supported_languages: languages.length ? languages : null,
    motion_sickness_level: motionSicknessLevel,
    seated_supported: modes.length ? modes.includes("SITTING") : null,
    standing_supported: modes.length ? (modes.includes("STANDING") || modes.includes("ROOM_SCALE")) : null,
  };
}

function reviewerLabel(index) {
  return index < 26 ? `리뷰어 ${String.fromCharCode(65 + index)}` : `리뷰어 ${index + 1}`;
}

// relay.user_reviews2.edges[].node 구조는 --inspect로 확인한 실제 값 기준.
// 작성자 식별 정보(author.alias 등)는 절대 저장하지 않고 익명 라벨로만 남긴다.
function extractReviews(relay) {
  const edges = relay?.user_reviews2?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map((edge, index) => {
    const node = edge?.node || {};
    return {
      meta_review_id: node.id ? String(node.id) : null,
      reviewer_label: reviewerLabel(index),
      rating: Number.isFinite(node.score) ? node.score : null,
      title_original: node.review_title || null,
      body_original: node.review_description || null,
      helpful_count: Number.isFinite(node.review_helpful_count) ? node.review_helpful_count : null,
      reviewed_at: Number.isFinite(node.date) ? new Date(node.date * 1000).toISOString() : null,
    };
  }).filter((review) => review.meta_review_id && (review.title_original || review.body_original));
}

await assertKoreanIp();

// --inspect 모드: 게임 하나만 실제로 요청해서 relay 객체 키 이름을 출력하고 종료
if (inspectId) {
  const games = await rest(`games?select=id,name,slug,meta_product_id&meta_product_id=eq.${inspectId}&limit=1`);
  const game = games?.[0];
  if (!game) throw new Error(`meta_product_id=${inspectId} 게임을 찾지 못했습니다.`);
  const url = `https://www.meta.com/ko-kr/experiences/${game.slug}/${metaUrlId(game.meta_product_id)}/`;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLERecentKrw/1.0" } });
  const html = await response.text();
  const relay = relayApp(html, metaUrlId(game.meta_product_id));
  if (!relay) { console.log("relay 객체를 찾지 못했습니다. 응답 상태:", response.status); process.exit(1); }
  console.log(`게임: ${game.name} (${url})`);
  console.log("relay 객체 최상위 키 목록:", Object.keys(relay));
  console.log("스크린샷/영상 관련으로 보이는 키만 필터:", Object.keys(relay).filter((k) => /image|screenshot|media|video|trailer|gallery|hero/i.test(k)));
  process.exit(0);
}

await mkdir(reportDir, { recursive: true });
const statusFilter = scope === "all" ? "" : "&source_status=like.official_meta_recent_overseas:*";

// 처리 우선순위(사용자 지정, 2026-09-02): 기본 정렬은 리뷰 많은 순. 그 순서로 900개씩
// 끊어서 그룹을 만들고, 그룹 안에서는 별점 높은 순으로 다시 정렬해서 그 그룹을 전부
// 처리한 뒤에야 다음 그룹으로 넘어간다. 리뷰/별점이 없는 게임은 각각 최하위로 밀린다.
// 매 실행마다 남은 후보로 다시 계산하므로(완료된 게임은 후보에서 빠짐), 그룹 경계가
// 자연스럽게 당겨지지만 "리뷰 많은 그룹부터 다 끝내고 다음 그룹" 순서는 그대로 유지된다.
// PostgREST의 order= 파라미터는 이런 그룹핑을 못 해서, 전체 후보를 다 받아온 뒤
// 자바스크립트에서 정렬하고 그중 --limit개만 골라 처리한다.
const GROUP_SIZE = 900;
function sortCandidatesByReviewGroupThenRating(list) {
  const byReviews = [...list].sort((a, b) => (b.review_count ?? -1) - (a.review_count ?? -1));
  byReviews.forEach((game, index) => { game._group = Math.floor(index / GROUP_SIZE); });
  return byReviews.sort((a, b) => (a._group !== b._group ? a._group - b._group : (b.rating ?? -1) - (a.rating ?? -1)));
}

async function fetchAllCandidates() {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await rest(
      `games?select=id,name,slug,meta_product_id,krw_price,krw_store_available,source_status,active,release_date,description_long,developer,motion_sickness_level,supported_languages,rating,review_count` +
      `${statusFilter}` +
      // motion_sickness_level과 krw_price는 후보 조건에서 뺀다 — 둘 다 "정상적으로
      // 확인했지만 값 자체가 없는 게 맞는" 경우가 있어서(comfort_rating이 NOT_RATED인
      // 게임, 한국 스토어에 없어서 krw_store_available=false로 확정된 게임) 조건에 넣으면
      // 이미 다 처리된 게임도 매번 다시 후보에 잡혀 무한 재처리된다(2026-09-02 실전에서
      // 둘 다 발견). krw_store_available과 developer/supported_languages가 이미 채워져
      // 있으면 각각 가격 확인·기기정보 추출을 이미 시도했다고 본다.
      `&or=(krw_store_available.is.null,release_date.is.null,description_long.is.null,developer.is.null,supported_languages.is.null)` +
      `&order=id.asc&limit=${pageSize}&offset=${offset}`
    );
    if (!page?.length) break;
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

const allCandidates = sortCandidatesByReviewGroupThenRating(await fetchAllCandidates());
const candidates = allCandidates.slice(0, limit);
console.log(`전체 후보 ${allCandidates.length}개 중 우선순위 상위 ${candidates.length}개를 처리합니다. (현재 그룹: ${candidates[0]?._group ?? "-"}, 리뷰 ${candidates[0]?.review_count ?? "-"}~${candidates.at(-1)?.review_count ?? "-"})`);

// 메타 CDN URL은 매번 요청할 때마다 서명 토큰이 바뀌어서 (game_id, url) 유니크 제약이
// 재수집을 걸러내지 못한다 — 이미 미디어가 있는 게임은 재요청해도 다시 넣지 않는다.
// (2026-09-02 발견: 재실행마다 스크린샷/트레일러가 중복 누적되던 버그, 62건 정리함)
const existingMedia = await rest(`game_media?select=game_id`);
const gamesWithMedia = new Set((existingMedia || []).map((row) => row.game_id));
// 리뷰도 마찬가지로, 게임이 다른 필드(release_date 등) 때문에 후보에 계속 남아있으면
// 매 실행마다 이미 저장된 리뷰까지 다시 번역하는 낭비가 생긴다 — 이미 저장된
// (game_id, meta_review_id) 조합은 건너뛴다.
const existingReviews = await rest(`game_reviews?select=game_id,meta_review_id`);
const savedReviewKeys = new Set((existingReviews || []).map((row) => `${row.game_id}:${row.meta_review_id}`));

// 게임 하나를 처리할 때마다(전체 배치가 끝나길 기다리지 않고) 바로 DB에 반영한다.
// 예전엔 전부 모았다가 배치 끝에 한꺼번에 썼는데, 그러면 중간에 스크립트를 멈췄을 때
// 이미 처리된 게임들까지 전부 유실됐다(2026-09-02 실전에서 발생 — 중단 시 아무것도
// 저장 안 된 채 처음부터 다시 해야 했음). 즉시 반영하면 중단해도 그때까지 처리된
// 건 안전하게 남는다.
async function applyRow(row) {
  const payload = { source_status: row.source_status, active: row.active, price_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (row.release_date) payload.release_date = row.release_date;
  if (row.krw_store_available != null) {
    payload.krw_price = row.krw_price;
    payload.krw_store_available = row.krw_store_available;
    payload.region_restricted = row.region_restricted;
  }
  if (row.description_long) {
    payload.description_long = row.description_long;
    payload.description_long_ko = row.description_long_ko;
  }
  if (row.device_info?.developer) Object.assign(payload, row.device_info);
  const patched = await rest(`games?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  const delta = { updated: patched?.length || 0, mediaInserted: 0, reviewsInserted: 0 };

  if (row._media?.length) {
    const mediaPayload = row._media.map((m) => ({ game_id: row.id, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store" }));
    const mediaResult = await rest(`game_media?on_conflict=game_id,url`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(mediaPayload),
    });
    delta.mediaInserted = mediaResult?.length || 0;
  }

  if (row._reviews?.length) {
    const reviewPayload = row._reviews.map((r) => ({
      game_id: row.id, meta_review_id: r.meta_review_id, reviewer_label: r.reviewer_label,
      rating: r.rating, title_original: r.title_original, body_original: r.body_original,
      title_ko: r.title_ko, body_ko: r.body_ko, helpful_count: r.helpful_count,
      reviewed_at: r.reviewed_at, source: "meta_store",
    }));
    const reviewResult = await rest(`game_reviews?on_conflict=game_id,meta_review_id`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(reviewPayload),
    });
    delta.reviewsInserted = reviewResult?.length || 0;
  }
  return delta;
}

const rows = [];
let updated = 0;
let mediaInserted = 0;
let reviewsInserted = 0;
let consecutiveBlocked = 0;
for (const game of candidates || []) {
  if (!game.slug || !game.meta_product_id) { rows.push({ id: game.id, name: game.name, status: "missing_slug_or_id" }); continue; }
  const metaId = metaUrlId(game.meta_product_id);
  const url = `https://www.meta.com/ko-kr/experiences/${game.slug}/${metaId}/`;
  let result = null;
  let media = [];
  let reviews = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (rows.length || attempt > 1) await sleep(delayMs + Math.floor(Math.random() * 4000));
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLERecentKrw/1.0" } });
      const html = await response.text();
      if (response.status === 403 || response.status === 429) {
        result = { id: game.id, name: game.name, status: `http_${response.status}`, attempt };
        consecutiveBlocked += 1;
        break;
      }
      if (!response.ok) { result = { id: game.id, name: game.name, status: `http_${response.status}`, attempt }; continue; }

      // 한 번의 응답(html)에서 가격/출시일 + 미디어 + 설명 + 리뷰를 함께 파싱
      const relay = relayApp(html, metaId);
      const parsed = parseKrw(html, metaId, relay);
      media = gamesWithMedia.has(game.id) ? [] : extractMedia(relay);
      const longDescription = game.description_long || extractLongDescription(relay);
      const needsTranslation = !game.description_long && longDescription;
      const descriptionLongKo = needsTranslation ? await translateLongDescription(longDescription) : null;
      const deviceInfo = (game.developer && game.supported_languages) ? {} : extractDeviceInfo(relay);
      reviews = extractReviews(relay).filter((review) => !savedReviewKeys.has(`${game.id}:${review.meta_review_id}`));
      for (const review of reviews) {
        review.title_ko = review.title_original ? await translateText(review.title_original) : null;
        review.body_ko = review.body_original ? await translateText(review.body_original) : null;
      }

      const krw = parsed.currency === "KRW" && Number.isFinite(parsed.price);
      const releasedByDate = parsed.release_date && Date.parse(`${parsed.release_date}T23:59:59Z`) <= Date.now();
      const prevPrefix = game.source_status?.includes(":") ? game.source_status.split(":")[0] : "official_meta_recent_overseas";
      const listingStatus = parsed.preorder ? "preorder" : releasedByDate || game.source_status?.endsWith(":released") ? "released" : "coming_soon";
      const storeResolved = krw || (parsed.found && listingStatus !== "coming_soon");
      result = {
        id: game.id, name: game.name, status: krw ? "krw_found" : storeResolved ? "not_krw_store" : parsed.found ? "metadata_only" : "unresolved",
        krw_price: krw ? parsed.price : null, krw_store_available: krw ? true : storeResolved ? false : null,
        region_restricted: krw ? false : storeResolved ? true : null, release_date: parsed.release_date,
        source_status: `${prevPrefix}:${listingStatus}`, active: listingStatus === "released",
        resolved: parsed.found, attempt, final_url: response.url, media_count: media.length,
        description_long: needsTranslation ? longDescription : null,
        description_long_ko: descriptionLongKo,
        device_info: deviceInfo,
        review_count: reviews.length,
      };
      consecutiveBlocked = 0;
      break;
    } catch (error) { result = { id: game.id, name: game.name, status: "fetch_error", attempt, error: error.message }; }
  }
  result._media = media;
  result._reviews = reviews;
  if (apply && result.resolved) {
    const delta = await applyRow(result);
    updated += delta.updated;
    mediaInserted += delta.mediaInserted;
    reviewsInserted += delta.reviewsInserted;
  }
  rows.push(result);
  if (consecutiveBlocked >= 2) { console.log("연속 2회 차단(403/429) 감지 — 이번 배치를 여기서 중단합니다."); break; }
}

const actionable = rows.filter((row) => row.resolved);

const report = {
  generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", scope,
  requested: candidates?.length || 0, checked: rows.length, actionable: actionable.length,
  updated, media_inserted: mediaInserted, reviews_inserted: reviewsInserted,
  rows: rows.map(({ _media, _reviews, ...rest }) => ({ ...rest, review_count: _reviews?.length ?? rest.review_count })), // 리포트 파일에는 media/reviews 배열 대신 개수만 남김
};
await writeFile(resolve(reportDir, `krw-report.${scope}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`통합 수집 [scope=${scope}]: 대상 ${report.requested}, 확인 ${report.checked}, 반영 가능 ${report.actionable}, games 반영 ${report.updated}, game_media 반영 ${report.media_inserted}, game_reviews 반영 ${report.reviews_inserted}`);
