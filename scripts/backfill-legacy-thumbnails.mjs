// scripts/backfill-legacy-thumbnails.mjs
//
// 1회성 스크립트: 예전 파이프라인이 넣어둔 정사각형(512x512) 앱 아이콘을, 메타 스토어가
// 실제로 보여주는 정확한 썸네일(app.image[0]["@id"], 가로형)로 교체한다.
// 대상 목록은 data/legacy-icon-backfill-ids.json (KRW 백필이 끝났고 image_path가
// "images/product_35505_" 접두어 — 즉 옛날 정사각형 아이콘인 게임들, 2026-09-05에
// SQL로 뽑아둔 1,784개).
//
// 썸네일 추출은 가격과 달리 요청 IP 국가와 무관하다(이미 US-IP 기반 lib/meta-store-import.js로
// 검증됨) — 그래서 이 스크립트는 서울 클라우드 서버나 사용자 자택 회선이 아니라 GitHub
// Actions 러너에서 돌린다. 서울 서버는 KRW 배치(scripts/sync-meta-recent-krw.mjs)의
// 요청량 때문에 이미 여유가 빠듯해서, 여기서 요청을 더 보태면 안 된다.
//
// 사용법: node scripts/backfill-legacy-thumbnails.mjs [--limit=N] [--start=N] [--delay=3000]

import { readFile } from "node:fs/promises";
import { relayApp, extractBaseInfo, uploadImageToStorage, metaUrlId } from "../lib/meta-collect.mjs";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images";
if (!SUPABASE_URL || !SECRET_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
console.log(`[디버그] SUPABASE_URL=${SUPABASE_URL} SECRET_KEY 길이=${SECRET_KEY.length} 끝4자=${SECRET_KEY.slice(-4)}`);

const restHeaders = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" };
async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...restHeaders, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const startIndex = Number(args.start) || 0;
const limit = Number(args.limit) || Infinity;
const delayMs = Number(args.delay) || 3000;

const ids = JSON.parse(await readFile(new URL("../data/legacy-icon-backfill-ids.json", import.meta.url), "utf8"));
const targetIds = ids.slice(startIndex, Number.isFinite(limit) ? startIndex + limit : undefined);
console.log(`전체 ${ids.length}개 중 ${startIndex}번부터 ${targetIds.length}개 처리합니다.`);

let ok = 0;
let fail = 0;
for (let i = 0; i < targetIds.length; i++) {
  const id = targetIds[i];
  const label = `[${startIndex + i + 1}/${ids.length}]`;
  try {
    const rows = await rest(`games?id=eq.${id}&select=id,name,meta_product_id,meta_store_url,image_path`);
    const game = rows?.[0];
    if (!game) throw new Error("게임을 찾을 수 없음");
    if (!game.image_path?.startsWith("images/product_35505_")) {
      console.log(`${label} SKIP ${game.name} -> 이미 처리됨(${game.image_path})`);
      continue;
    }
    const metaId = metaUrlId(game.meta_product_id);
    const response = await fetch(game.meta_store_url, {
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLEThumbnailBackfill/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`페이지 요청 실패 (${response.status})`);
    const html = await response.text();
    const relay = relayApp(html, metaId);
    const baseInfo = extractBaseInfo(html, relay, metaId);
    if (!baseInfo.imageUrl) throw new Error("이미지 URL을 찾지 못함");

    const imagePath = await uploadImageToStorage({
      imageUrl: baseInfo.imageUrl,
      path: `images/${metaId}.webp`,
      supabaseUrl: SUPABASE_URL,
      supabaseSecretKey: SECRET_KEY,
      bucket: BUCKET,
    });
    if (!imagePath) throw new Error("Storage 업로드 실패");

    await rest(`games?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ image_path: imagePath, source_image_url: baseInfo.imageUrl, updated_at: new Date().toISOString() }),
    });
    ok++;
    console.log(`${label} OK ${game.name} -> ${imagePath}`);
  } catch (error) {
    fail++;
    console.log(`${label} FAIL ${id} -> ${error.message}`);
  }
  await sleep(delayMs);
}
console.log(`=== 완료: 성공 ${ok} / 실패 ${fail} ===`);
