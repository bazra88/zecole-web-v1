// lib/meta-collect.mjs
//
// 메타스토어 KR 페이지 하나에서 가격/미디어/설명(원문+번역)/리뷰/기기정보/기본정보를
// 한 번에 파싱하는 공용 로직. scripts/sync-meta-recent-krw.mjs(배치 백필)와
// scripts/import-api-server.mjs(관리자 페이지의 "세부정보 갱신"/"신규 게임 등록" 버튼이
// 호출하는 API, 서울 클라우드 서버에서 상시 구동)가 이 파일을 같이 쓴다.
// 절대 두 곳에 따로 복사하지 말 것 — 필드명 버그를 두 번 고쳐야 하는 사고가 난다.
//
// ⚠️ 가격(parseKrw)은 반드시 한국 IP에서 실행되는 코드에서만 써야 한다 (메타는 요청 IP의
// 실제 국가로 통화를 결정한다) — Vercel(미국 IP)에서 직접 쓰면 KRW가 아니라 USD가 나온다.
// 다만 썸네일(extractBaseInfo의 imageUrl, relayApp, uploadImageToStorage)은 IP 국가와
// 무관하다는 게 검증됐다(2026-09-05) — app/api/admin/thumbnail-backfill/route.js가 이
// 함수들만 Vercel에서 직접 쓰는 건 의도된 것이니 KR IP로 옮기지 말 것.

export const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export const slugify = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// meta.com 게임 상세페이지 주소에서 slug/메타상품ID를 뽑는다.
export function parseMetaStoreUrl(rawUrl) {
  let parsedUrl;
  try { parsedUrl = new URL(String(rawUrl || "").trim()); } catch { throw new Error("올바른 Meta 스토어 주소를 입력해 주세요."); }
  if (!/(^|\.)meta\.com$/i.test(parsedUrl.hostname)) throw new Error("meta.com 스토어 주소만 등록할 수 있습니다.");
  const match = parsedUrl.pathname.match(/\/experiences\/(?!section\/)(?:(?:([^/?#]+)\/)?(\d{6,}))\/?/i);
  if (!match) throw new Error("게임 상세 페이지 주소 형식을 확인해 주세요.");
  const [, urlSlug = "experience", metaId] = match;
  return { slug: slugify(urlSlug) || `meta-${metaId}`, metaId };
}

// games.meta_product_id는 두 형식이 섞여있다: 순수 숫자와 "product_35505_숫자" 접두어 형식.
// 실제 메타스토어 URL과 relay 객체의 id는 항상 마지막 숫자 부분만 쓴다.
export const metaUrlId = (value) => String(value).split("_").pop();

export function normalizedDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const korean = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

// 같은 게임(app_store_item)의 필드가 페이지 안 여러 <script> JSON 블록에 나뉘어 실려있어서
// 하나만 골라잡으면 안 되고 매칭되는 블록을 전부 병합해야 한다. 이미 채워진 필드는 덮어쓰지 않는다.
export function relayApp(html, metaId) {
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

export function jsonLdApp(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      if (app) return app;
    } catch {}
  }
  return null;
}

export function metaContent(html, property) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tag[0];
    const key = attrs.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property.toLowerCase()) continue;
    return attrs.match(/content=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&") || null;
  }
  return null;
}

// relay.pre_order_bundles는 예약구매 특전 번들을 가리키는 필드라서, 게임이 정식 출시된
// 뒤에도 계속 남아있다(특전 자체는 출시 후에도 유효하니까) — "아직 예약구매 중"이라는
// 뜻이 아니다. live_release_channel이 LIVE면 이미 정식 출시된 것이니 그걸 우선한다
// (2026-09-04, Knights of Fiona가 출시 다음날인데도 계속 preorder로 비활성화되는
// 버그를 보고 발견함).
function isLiveReleased(relay) {
  if (relay?.live_release_channel?.channel_name === "LIVE") return true;
  return Array.isArray(relay?.release_channels?.nodes) && relay.release_channels.nodes.some((node) => node?.channel_name === "LIVE");
}

export function parseKrw(html, metaId, relay) {
  const app = jsonLdApp(html);
  const releasedLive = isLiveReleased(relay);
  if (app) {
    const offer = Array.isArray(app.offers) ? app.offers[0] : app.offers;
    const availability = offer?.availability || null;
    return {
      found: true,
      currency: offer?.priceCurrency || null,
      price: offer?.price == null ? null : Number(offer.price),
      available: /InStock|PreOrder/i.test(offer?.availability || "") || offer?.price != null,
      preorder: !releasedLive && (/PreOrder/i.test(availability || "") || (relay?.pre_order_bundles?.length || 0) > 0),
      release_date: normalizedDate(app?.datePublished || app?.releaseDate || relay?.release_info?.display_date),
    };
  }
  const currency = relay?.current_offer?.price?.currency || null;
  const amount = Number(relay?.current_offer?.price?.offset_amount);
  const price = Number.isFinite(amount) ? amount / 100 : null;
  return {
    found: Boolean(relay), currency, price, available: Boolean(relay?.current_offer),
    preorder: !releasedLive && (relay?.pre_order_bundles?.length || 0) > 0,
    release_date: normalizedDate(relay?.release_info?.display_date),
  };
}

// relay.screenshots / relay.screenshotsThumbnail → 둘 다 { uri } 객체의 배열, 같은 순서로 짝지어짐
// relay.trailer → 단일 객체 { uri, thumbnail: { uri } } (배열 아님, 게임당 트레일러 최대 1개)
export function extractMedia(relay) {
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
export async function translateText(text, target = "ko") {
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
// 끼어있다 — game_media의 대표 트레일러/스크린샷과는 별개(URL이 다름)라 그대로 살려둔다.
export function extractLongDescription(relay) {
  const text = relay?.display_long_description;
  if (typeof text !== "string" || !text.trim()) return null;
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// 인라인 이미지/영상 마크다운은 URL이라 번역기에 그대로 넣으면 URL 중간에 공백이 끼어 깨진다.
export async function translateLongDescription(text) {
  const parts = text.split(/(!\[[^\]]*\]\([^)]*\))/g).map((part) => part.trim()).filter(Boolean);
  const translated = [];
  for (const part of parts) {
    translated.push(/^!\[[^\]]*\]\([^)]*\)$/.test(part) ? part : (await translateText(part)) ?? part);
  }
  return translated.join("\n\n");
}

// relay.comfort_rating 실제 관측값(2026-09-02) 기준 매핑 — 3개 값만 확인됨, 5단계 라벨 중
// 1/3/5에만 매핑(2·4는 비워둠). 매핑에 없는 새 값은 null 처리 + 경고 로그.
export const COMFORT_LEVEL_MAP = { COMFORTABLE_FOR_MOST: 1, COMFORTABLE_FOR_SOME: 3, COMFORTABLE_FOR_FEW: 5 };

export function extractDeviceInfo(relay) {
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

export function reviewerLabel(index) {
  return index < 26 ? `리뷰어 ${String.fromCharCode(65 + index)}` : `리뷰어 ${index + 1}`;
}

// relay.user_reviews2.edges[].node 구조. 작성자 식별 정보(author.alias 등)는 절대
// 저장하지 않고 익명 라벨로만 남긴다.
export function extractReviews(relay) {
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

// 신규 게임 등록(아직 games 행이 없는 경우)에 필요한 기본 정보 — 이름/이미지/짧은 설명/
// 장르/평점/리뷰수. lib/meta-store-import.js(기존 미국 IP 기반 등록 플로우)와 같은 방식으로
// jsonLd/relay/og 메타 태그 순으로 폴백한다.
export function extractBaseInfo(html, relay, metaId) {
  const app = jsonLdApp(html);
  const first = (value) => Array.isArray(value) ? value[0] : value;
  const image = first(app?.image || app?.thumbnailUrl);
  // jsonLd 이미지 배열 항목은 {"@id": "..."} 형태다("url"이 아니라 "@id") — 이걸 놓치면
  // 스토어가 실제로 보여주는 썸네일(og:image와 동일한 파일)이 아니라 hero_image(스토어
  // 상세페이지용 광각 배너, 다른 이미지)로 잘못 대체된다 (2026-09-05, Exer: Gale에서
  // 스토어 썸네일과 전혀 다른 이미지가 나오는 걸 보고 발견).
  const imageUrl = typeof image === "string" ? image : image?.["@id"] || image?.url || relay?.hero_image?.uri || metaContent(html, "og:image") || null;
  const name = app?.name || relay?.display_name || metaContent(html, "og:title") || null;
  const genres = [...new Set(
    [app?.applicationSubCategory, app?.applicationCategory, relay?.genre_names]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
  return {
    name: name ? String(name).trim() : null,
    imageUrl,
    genres,
    rating: Number(app?.aggregateRating?.ratingValue) || null,
    reviewCount: Number(app?.aggregateRating?.ratingCount) || null,
  };
}

// 썸네일을 다운로드해서 Supabase Storage에 영구 저장한다. source_image_url(메타 CDN
// 원본 링크)만 저장하면 서명 토큰이 1~2일 안에 만료돼서 썸네일이 깨진다 — image_path
// (우리 Storage 사본)를 항상 같이 채워야 한다 (2026-09-05, 89개 게임 썸네일이 깨진 걸
// 보고 발견). 실패해도 예외를 던지지 않고 null을 반환한다 — 호출자는 최소한
// source_image_url은 이미 저장했을 것이므로 이번엔 그냥 넘어가도 된다.
export async function uploadImageToStorage({ imageUrl, path, supabaseUrl, supabaseSecretKey, bucket = "game-images" }) {
  if (!imageUrl || !path || !supabaseUrl || !supabaseSecretKey) return null;
  try {
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imageResponse.ok) return null;
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type") || "image/webp";
    const uploadUrl = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${bucket}/${path}`;
    // Storage API는 REST(PostgREST)와 달리 apikey 헤더가 같이 없으면 Authorization의
    // sb_secret_... 키를 "Invalid Compact JWS"로 거부한다 (2026-09-05, 직접 테스트해서 확인).
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${supabaseSecretKey}`, "Content-Type": contentType, "x-upsert": "true" },
      body: buffer,
      signal: AbortSignal.timeout(20_000),
    });
    return uploadResponse.ok ? path : null;
  } catch {
    return null;
  }
}

// 게임 하나(html 응답 하나)를 받아서 games/game_media/game_reviews에 반영할 전체 payload를
// 만든다. 신규 게임(existingGame == null)이면 기본정보(이름/이미지/장르)까지 포함한다.
// skipTranslation이 true면(이미 description_long/리뷰가 있는 경우) 번역 API 호출을 건너뛴다.
export async function collectGameData({ html, metaId, existingGame, skipDescriptionTranslation, existingReviewIds, hasExistingMedia }) {
  const relay = relayApp(html, metaId);
  const parsed = parseKrw(html, metaId, relay);
  // 메타 CDN URL은 매번 요청할 때마다 서명 토큰이 바뀌어서 (game_id, url) 유니크 제약이
  // 재수집을 걸러내지 못한다 — 이미 미디어가 있는 게임은 재요청해도 다시 넣지 않는다
  // (2026-09-02 배치 스크립트에서 발견한 버그, 이 API에도 그대로 있어서 같이 고침).
  const media = hasExistingMedia ? [] : extractMedia(relay);
  const deviceInfo = extractDeviceInfo(relay);

  const longDescription = extractLongDescription(relay);
  const descriptionLongKo = longDescription && !skipDescriptionTranslation ? await translateLongDescription(longDescription) : null;

  const reviews = extractReviews(relay).filter((review) => !existingReviewIds?.has(review.meta_review_id));
  for (const review of reviews) {
    review.title_ko = review.title_original ? await translateText(review.title_original) : null;
    review.body_ko = review.body_original ? await translateText(review.body_original) : null;
  }

  const krw = parsed.currency === "KRW" && Number.isFinite(parsed.price);
  const releasedByDate = parsed.release_date && Date.parse(`${parsed.release_date}T23:59:59Z`) <= Date.now();
  const prevPrefix = existingGame?.source_status?.includes(":") ? existingGame.source_status.split(":")[0] : "manual_admin";
  const listingStatus = parsed.preorder ? "preorder" : releasedByDate || existingGame?.source_status?.endsWith(":released") ? "released" : "coming_soon";
  const storeResolved = krw || (parsed.found && listingStatus !== "coming_soon");

  const gamesPayload = {
    source_status: `${prevPrefix}:${listingStatus}`,
    active: listingStatus === "released",
    price_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (parsed.release_date) gamesPayload.release_date = parsed.release_date;
  if (storeResolved || existingGame) {
    gamesPayload.krw_price = krw ? parsed.price : null;
    gamesPayload.krw_store_available = krw ? true : storeResolved ? false : null;
    gamesPayload.region_restricted = krw ? false : storeResolved ? true : null;
  }
  if (longDescription) {
    gamesPayload.description_long = longDescription;
    if (descriptionLongKo) gamesPayload.description_long_ko = descriptionLongKo;
  }
  if (deviceInfo.developer) Object.assign(gamesPayload, deviceInfo);

  // existingGame이 있어도 baseInfo(특히 imageUrl)는 항상 뽑아둔다 — image_path가
  // 없는 기존 게임의 썸네일을 이번 기회에 영구 저장하려면 호출자가 이 값을 필요로 한다.
  const baseInfo = extractBaseInfo(html, relay, metaId);
  if (!existingGame) {
    if (baseInfo.name) gamesPayload.name = baseInfo.name;
    if (baseInfo.imageUrl) gamesPayload.source_image_url = baseInfo.imageUrl;
    if (baseInfo.rating) gamesPayload.rating = baseInfo.rating;
    if (baseInfo.reviewCount) gamesPayload.review_count = baseInfo.reviewCount;
    gamesPayload.pricing_type = krw ? (parsed.price === 0 ? "free" : "paid") : "unknown";
  }

  return {
    resolved: parsed.found,
    krwFound: krw,
    gamesPayload,
    media,
    reviews,
    baseInfo,
  };
}
