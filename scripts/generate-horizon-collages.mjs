// scripts/generate-horizon-collages.mjs
//
// 홈페이지 "Horizon 카탈로그"/"인디 카탈로그" 타일의 배경 콜라주를 매번 브라우저에서
// 50개 이상의 <img> 태그로 라이브 렌더링하던 걸(요청마다 원본 고해상도 썸네일을 통째로
// 받아서 40~70px 크기로 줄여 보여주는 낭비), 한 장의 합성 이미지로 미리 구워서
// Storage에 올려두는 방식으로 바꾼다(2026-09-07). 매달 호라이즌+ 카탈로그가
// sync-horizon-plus.mjs로 갱신될 때마다 이 스크립트도 같이 돌려서 그 달의 콜라주를
// 새로 생성한다.
//
// 열 개수 공식은 app/page.js의 HorizonTile()이 쓰던 것과 동일한 유도식을 그대로 쓴다:
// 열 ≈ sqrt(게임수 * 목표비율상수) — 목표비율상수 = 9*targetRatio/16, targetRatio는
// 실제 데스크톱 타일 가로/세로(약 502/320)를 기준으로 잡았다. 각 셀을 정확히 16:9로
// 나누기 때문에 원본 썸네일이 잘리지 않고, 전체 콜라주 캔버스 크기도 셀 크기*행/열
// 수로 정확히 계산해서 안쪽에 빈틈이 남지 않는다.
//
// 사용법: node scripts/generate-horizon-collages.mjs [--apply]
// (--apply 없이 실행하면 계산 결과만 로그로 보여주고 업로드하지 않는다)

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const apply = process.argv.includes("--apply");

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const env = (key) => process.env[key] || localEnv[key];

const rawUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const secretKey = env("SUPABASE_SECRET_KEY");
const bucket = env("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET") || "game-images";
if (!rawUrl || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const restHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" };

async function rest(path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: restHeaders });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

function gameImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

// app/globals.css의 .horizon-grid .horizon-tile 데스크톱 기준 비율(약 502x320)에 맞춘 상수.
const BAKE_WIDTH = 1200;
const TARGET_RATIO = 502 / 320;
const RATIO_CONSTANT = (9 * TARGET_RATIO) / 16;

async function fetchBuffer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`이미지 요청 실패 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function buildCollage(games) {
  const n = games.length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(n * RATIO_CONSTANT)));
  const rows = Math.max(1, Math.ceil(n / columns));
  const cellWidth = Math.round(BAKE_WIDTH / columns);
  const cellHeight = Math.round((cellWidth * 9) / 16);
  const canvasWidth = cellWidth * columns;
  const canvasHeight = cellHeight * rows;
  const collageSize = columns * rows;

  const composites = [];
  let failed = 0;
  for (let index = 0; index < collageSize; index += 1) {
    const game = games[index % n];
    const url = gameImageUrl(game.image_path || game.source_image_url);
    if (!url) { failed += 1; continue; }
    try {
      const buffer = await fetchBuffer(url);
      const resized = await sharp(buffer).resize(cellWidth, cellHeight, { fit: "fill" }).toBuffer();
      composites.push({ input: resized, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight });
    } catch (error) {
      failed += 1;
      console.log(`  이미지 실패: ${game.name} — ${error.message}`);
    }
  }

  const collageBuffer = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: "#1c1c20" },
  })
    .composite(composites)
    .webp({ quality: 82 })
    .toBuffer();

  return { collageBuffer, columns, rows, canvasWidth, canvasHeight, placed: composites.length, failed };
}

async function uploadBuffer(buffer, path) {
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, "Content-Type": "image/webp", "x-upsert": "true" },
    signal: AbortSignal.timeout(30_000),
    body: buffer,
  });
  if (!response.ok) throw new Error(`Storage 업로드 실패 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return path;
}

const entries = await rest(
  "horizon_plus_entries?select=month,category,game:games(id,name,image_path,source_image_url)" +
  "&category=in.(horizon_catalog,indie_catalog)&order=month.desc,id.asc&limit=1000"
);
const latestMonth = [...new Set(entries.map((row) => row.month))].sort().at(-1);
const latest = entries.filter((row) => row.month === latestMonth);
const monthTag = latestMonth?.slice(0, 7); // "2026-09-01" -> "2026-09"

for (const category of ["horizon_catalog", "indie_catalog"]) {
  const games = latest
    .filter((row) => row.category === category)
    .map((row) => row.game)
    .filter((game) => game?.image_path || game?.source_image_url);
  if (!games.length) {
    console.log(`[${category}] 대상 게임이 없어 건너뜁니다.`);
    continue;
  }
  console.log(`[${category}] ${games.length}개 게임으로 콜라주 생성 중 (month=${monthTag})...`);
  const { collageBuffer, columns, rows, canvasWidth, canvasHeight, placed, failed } = await buildCollage(games);
  console.log(`  ${columns}열 x ${rows}행, 캔버스 ${canvasWidth}x${canvasHeight}, 배치 ${placed}개, 실패 ${failed}개, 용량 ${(collageBuffer.length / 1024).toFixed(0)}KB`);
  const path = `collages/${category}-${monthTag}.webp`;
  if (apply) {
    await uploadBuffer(collageBuffer, path);
    console.log(`  업로드 완료: ${path}`);
  } else {
    console.log(`  (dry-run) 업로드 생략 — 실제 반영하려면 --apply를 붙이세요. 대상 경로: ${path}`);
  }
}
