// scripts/backfill-description-translations.mjs
//
// translateText()에 재시도 로직이 없던 시절, 무료 구글 번역 비공식 엔드포인트가 한 번만
// 실패해도 games.description_long_ko에 원문(영어)이 그대로 저장된 채 영영 남아있었다
// (2026-09-23, 실측: description_long이 있는 3,900개 중 1,808개/46%가 이 상태였음).
// 메타 스토어에는 다시 요청하지 않는다 — 이미 DB에 있는 description_long을 다시
// 번역해서 description_long_ko만 덮어쓰는 순수 번역 백필이라 IP 차단과 무관하다.
//
// 사용법: node scripts/backfill-description-translations.mjs [--dry-run]

import { readFile } from "node:fs/promises";
import { translateLongDescription, sleep } from "../lib/meta-collect.mjs";

const dryRun = process.argv.includes("--dry-run");
const root = process.cwd();

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const env = (key) => process.env[key] || localEnv[key];

const SUPABASE_URL = (env("NEXT_PUBLIC_SUPABASE_URL") || "").trim().replace(/\/+$/, "");
const SECRET_KEY = env("SUPABASE_SECRET_KEY");
if (!SUPABASE_URL || !SECRET_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
const headers = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" };

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function restPage(path, offset, limit) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...headers, Range: `${offset}-${offset + limit - 1}`, Prefer: "count=exact" } });
  const total = Number(response.headers.get("content-range")?.split("/")?.[1]) || 0;
  return { rows: await response.json(), total };
}

const hasKorean = (s) => /[가-힣]/.test(s || "");

console.log("설명 번역 상태 조회 중...");
let offset = 0;
let all = [];
while (true) {
  const { rows, total } = await restPage("games?select=id,name,description_long,description_long_ko&description_long=not.is.null", offset, 1000);
  all = all.concat(rows);
  if (rows.length < 1000 || all.length >= total) break;
  offset += 1000;
}

const targets = all.filter((g) => !hasKorean(g.description_long) && (!g.description_long_ko || g.description_long_ko === g.description_long || !hasKorean(g.description_long_ko)));
console.log(`전체 ${all.length}개 중 재번역 대상 ${targets.length}개`);
if (dryRun) { console.log("--dry-run 모드라 여기서 종료합니다."); process.exit(0); }

let fixed = 0, failed = 0;
for (const [index, game] of targets.entries()) {
  try {
    const translated = await translateLongDescription(game.description_long);
    if (translated && hasKorean(translated)) {
      await rest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ description_long_ko: translated, updated_at: new Date().toISOString() }) });
      fixed++;
    } else {
      failed++;
      console.log(`  [실패] ${game.name}`);
    }
  } catch (error) {
    failed++;
    console.log(`  [오류] ${game.name}: ${error.message}`);
  }
  if ((index + 1) % 50 === 0) console.log(`진행: ${index + 1}/${targets.length} (성공 ${fixed}, 실패 ${failed})`);
  await sleep(200);
}

console.log(`=== 완료: 성공 ${fixed} / 실패 ${failed} / 전체 ${targets.length} ===`);
