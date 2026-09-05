// scripts/import-api-server.mjs
//
// 관리자 페이지의 "세부정보 갱신"/"신규 게임 등록" 버튼이 호출하는 상시 구동 API.
// 반드시 한국 IP(서울 클라우드 서버)에서 돌려야 한다 — Vercel(미국 IP)에서 직접
// 메타스토어를 호출하면 KRW 가격이 아니라 USD가 나온다는 게 이 프로젝트의 핵심 제약.
// 관리자 페이지 자체는 Vercel에서 실행되니, 그 서버 액션이 이 API를 HTTP로 호출해서
// "게임 하나"만 한국 IP로 처리하고 결과를 돌려받는 구조다.
//
// scripts/sync-meta-recent-krw.mjs(배치 백필)와 파싱 로직을 공유한다 —
// lib/meta-collect.mjs 참고. 그쪽을 고치면 여기도 같이 확인할 것.
//
// systemd로 상시 구동 (deploy/import-api.service 참고). 포트는 기본 4001,
// IMPORT_API_SECRET 없이는 기동하지 않는다(관리자 페이지 외 누구도 못 부르게).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  metaUrlId, relayApp, parseMetaStoreUrl, collectGameData, uploadImageToStorage,
} from "../lib/meta-collect.mjs";

const root = process.cwd();

// --- 환경변수 ---
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const env = (key) => process.env[key] || localEnv[key];

const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = env("SUPABASE_SECRET_KEY");
const storageBucket = env("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET") || "game-images";
const PORT = Number(env("IMPORT_API_PORT") || 4001);
const API_SECRET = env("IMPORT_API_SECRET");
if (!rawUrl || !secretKey) throw new Error("Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)가 필요합니다.");
if (!API_SECRET) throw new Error("IMPORT_API_SECRET 환경변수가 필요합니다 (관리자 페이지 외 접근을 막는 비밀 토큰).");

const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const supabaseHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...supabaseHeaders, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function handleImport({ meta_store_url, game_id }) {
  let slug, metaId, existingGame = null;

  if (game_id) {
    if (!/^[0-9a-f-]{36}$/i.test(game_id)) throw new Error("game_id 형식이 올바르지 않습니다.");
    const rows = await rest(`games?id=eq.${game_id}&select=*`);
    existingGame = rows?.[0];
    if (!existingGame) throw new Error("게임을 찾을 수 없습니다.");
    if (!existingGame.slug || !existingGame.meta_product_id) throw new Error("이 게임은 slug/meta_product_id가 없어 갱신할 수 없습니다.");
    slug = existingGame.slug;
    metaId = metaUrlId(existingGame.meta_product_id);
  } else if (meta_store_url) {
    const parsed = parseMetaStoreUrl(meta_store_url);
    slug = parsed.slug;
    metaId = parsed.metaId;
    const found = await rest(`games?select=*&or=(meta_product_id.eq.${metaId},meta_catalog_item_id.eq.${metaId})&limit=1`);
    existingGame = found?.[0] || null;
    if (existingGame?.slug && existingGame?.meta_product_id) {
      slug = existingGame.slug;
      metaId = metaUrlId(existingGame.meta_product_id);
    }
  } else {
    throw new Error("meta_store_url 또는 game_id 중 하나가 필요합니다.");
  }

  const url = `https://www.meta.com/ko-kr/experiences/${slug}/${metaId}/`;
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLEImportAPI/1.0" },
  });
  if (!response.ok) throw new Error(`메타스토어 페이지 요청 실패 (${response.status})`);
  const html = await response.text();
  if (!relayApp(html, metaId)) throw new Error("메타스토어 응답에서 게임 데이터를 찾지 못했습니다. 주소를 확인해 주세요.");

  let existingReviewIds = new Set();
  let hasExistingMedia = false;
  if (existingGame) {
    const [reviewRows, mediaRows] = await Promise.all([
      rest(`game_reviews?game_id=eq.${existingGame.id}&select=meta_review_id`),
      rest(`game_media?game_id=eq.${existingGame.id}&select=id&limit=1`),
    ]);
    existingReviewIds = new Set((reviewRows || []).map((r) => r.meta_review_id));
    hasExistingMedia = Boolean(mediaRows?.length);
  }

  const collected = await collectGameData({
    html,
    metaId,
    existingGame,
    skipDescriptionTranslation: Boolean(existingGame?.description_long),
    existingReviewIds,
    hasExistingMedia,
  });
  if (!collected.resolved) throw new Error("메타스토어에서 게임 정보를 확인하지 못했습니다.");

  // image_path(우리 Storage 사본)가 없는 게임은 이번에 받은 정확한 썸네일을 다운로드해서
  // 영구 저장한다 — source_image_url(메타 CDN 원본 링크)만 있으면 서명 토큰이 1~2일 안에
  // 만료돼서 썸네일이 깨진다 (2026-09-05 발견). 실패해도 등록/갱신 자체는 계속 진행한다.
  if (!existingGame?.image_path && collected.baseInfo?.imageUrl) {
    const imagePath = await uploadImageToStorage({
      imageUrl: collected.baseInfo.imageUrl,
      path: `images/${metaId}.webp`,
      supabaseUrl,
      supabaseSecretKey: secretKey,
      bucket: storageBucket,
    });
    if (imagePath) {
      collected.gamesPayload.image_path = imagePath;
      collected.gamesPayload.source_image_url = collected.baseInfo.imageUrl;
    }
  }

  let gameId = existingGame?.id;
  if (existingGame) {
    await rest(`games?id=eq.${gameId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(collected.gamesPayload) });
  } else {
    if (!collected.gamesPayload.name) throw new Error("게임 이름을 확인하지 못했습니다.");
    const payload = {
      ...collected.gamesPayload,
      meta_product_id: metaId,
      meta_catalog_item_id: metaId,
      slug,
      meta_store_url: url,
      admin_hidden: false,
    };
    const inserted = await rest("games", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    gameId = inserted?.[0]?.id;
    if (!gameId) throw new Error("게임 등록에 실패했습니다.");

    for (const genreName of collected.baseInfo?.genres || []) {
      const rows = await rest(`genres?name=eq.${encodeURIComponent(genreName)}&select=id&limit=1`);
      let genreId = rows?.[0]?.id;
      if (!genreId) {
        const created = await rest("genres", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name: genreName, slug: `meta-${genreName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` }),
        });
        genreId = created?.[0]?.id;
      }
      if (genreId) {
        await rest("game_genres?on_conflict=game_id,genre_id", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({ game_id: gameId, genre_id: genreId }),
        });
      }
    }
  }

  let mediaInserted = 0;
  if (collected.media.length) {
    const payload = collected.media.map((m) => ({ game_id: gameId, media_type: m.media_type, url: m.url, thumbnail_url: m.thumbnail_url, sort_order: m.sort_order, source: "meta_store" }));
    const result = await rest("game_media?on_conflict=game_id,url", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    mediaInserted = result?.length || 0;
  }

  let reviewsInserted = 0;
  if (collected.reviews.length) {
    const payload = collected.reviews.map((r) => ({
      game_id: gameId, meta_review_id: r.meta_review_id, reviewer_label: r.reviewer_label,
      rating: r.rating, title_original: r.title_original, body_original: r.body_original,
      title_ko: r.title_ko, body_ko: r.body_ko, helpful_count: r.helpful_count,
      reviewed_at: r.reviewed_at, source: "meta_store",
    }));
    const result = await rest("game_reviews?on_conflict=game_id,meta_review_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    reviewsInserted = result?.length || 0;
  }

  return {
    success: true,
    created: !existingGame,
    game_id: gameId,
    slug,
    name: collected.gamesPayload.name || existingGame?.name,
    krw_price: collected.gamesPayload.krw_price ?? existingGame?.krw_price ?? null,
    krw_store_available: collected.gamesPayload.krw_store_available ?? existingGame?.krw_store_available ?? null,
    media_inserted: mediaInserted,
    reviews_inserted: reviewsInserted,
    image_path: collected.gamesPayload.image_path ?? existingGame?.image_path ?? null,
  };
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/import-game") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  if (req.headers.authorization !== `Bearer ${API_SECRET}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const input = body ? JSON.parse(body) : {};
    const result = await handleImport(input);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error(new Date().toISOString(), "import-game 실패:", error.message);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message || "알 수 없는 오류" }));
  }
});

// Vercel(외부)에서 접속해야 하니 0.0.0.0으로 바인딩한다 — 접근 제어는 IMPORT_API_SECRET
// 베어러 토큰 + 방화벽 포트 제한으로 한다 (Vercel은 고정 IP가 없어서 IP 화이트리스트는 불가).
server.listen(PORT, "0.0.0.0", () => console.log(`import-api-server listening on 0.0.0.0:${PORT}`));
