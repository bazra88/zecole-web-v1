import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-paid");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_PAID_BATCH");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_PAID_BATCH 확인값이 필요합니다.");
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const key = apply ? process.env.SUPABASE_SECRET_KEY : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const diff = JSON.parse(await readFile(resolve(dataDir, "diff-report.json"), "utf8"));
const rows = diff.rows.filter((row) => row.status === "review_required");
const genreSlugs = {
  "격투": "fighting", "내러티브": "narrative", "미디어": "media", "샌드박스": "sandbox", "서바이벌": "survival",
  "슈팅 게임": "shooting", "스포츠": "sports", "시뮬레이션": "simulation", "아케이드": "arcade", "액션": "action",
  "어드벤처": "adventure", "여행/탐험": "travel-exploration", "전략": "strategy", "테이블탑": "tabletop", "퍼즐": "puzzle",
  "플랫폼 게임": "platform", "피트니스/웰빙": "fitness-wellness", "학습": "education",
  "파티 게임": "party", "창의성": "creativity", "롤플레잉": "role-playing",
};
const unknownGenres = [...new Set(rows.map((row) => row.genre).filter((genre) => genre && !genreSlugs[genre]))];
const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", candidates: rows.length, unknown_genres: unknownGenres, updated: 0, genre_links: 0, failed: [], status: "pending" };
if (!apply) {
  report.status = "ready";
  await writeFile(resolve(dataDir, "sync-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`유료게임 동기화 미리보기: ${rows.length}개, DB 변경 없음`);
  process.exit(0);
}

const genres = [...new Set(rows.map((row) => row.genre).filter(Boolean))].map((name) => ({
  name,
  slug: genreSlugs[name] || `meta-genre-${createHash("sha256").update(name).digest("hex").slice(0, 12)}`,
}));
let url = new URL(`${supabaseUrl}/rest/v1/genres`);
url.searchParams.set("on_conflict", "name");
let response = await fetch(url, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(genres) });
if (!response.ok) throw new Error(`장르 준비 실패: ${response.status} ${await response.text()}`);

const queue = [...rows];
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const row = queue.shift();
    const payload = { ...row.payload, source_status: "official_meta_paid_reviewed" };
    delete payload.name;
    if (row.price_changed && row.price_field) {
      payload[row.price_field] = row.official_price;
      payload.price_checked_at = new Date().toISOString();
      if (row.price_field === "krw_price") payload.krw_store_available = true;
    }
    const patchUrl = new URL(`${supabaseUrl}/rest/v1/games`);
    patchUrl.searchParams.set("id", `eq.${row.id}`);
    try {
      const patchResponse = await fetch(patchUrl, { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(payload) });
      const body = patchResponse.ok ? await patchResponse.json() : await patchResponse.text();
      if (patchResponse.ok && Array.isArray(body) && body.length === 1) report.updated += 1;
      else report.failed.push({ id: row.id, name: row.source_name, status: patchResponse.status, error: typeof body === "string" ? body.slice(0, 300) : "updated_row_count_mismatch" });
    } catch (error) { report.failed.push({ id: row.id, name: row.source_name, status: 0, error: error.message }); }
  }
});
await Promise.all(workers);

if (!report.failed.length) {
  const genreUrl = new URL(`${supabaseUrl}/rest/v1/genres`); genreUrl.searchParams.set("select", "id,name");
  const genreResponse = await fetch(genreUrl, { headers });
  if (!genreResponse.ok) throw new Error("장르 ID 조회 실패");
  const genreIds = new Map((await genreResponse.json()).map((genre) => [genre.name, genre.id]));
  const links = rows.map((row) => ({ game_id: row.id, genre_id: genreIds.get(row.genre) })).filter((link) => link.genre_id);
  const linkUrl = new URL(`${supabaseUrl}/rest/v1/game_genres`); linkUrl.searchParams.set("on_conflict", "game_id,genre_id");
  response = await fetch(linkUrl, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(links) });
  if (!response.ok) throw new Error(`장르 연결 실패: ${response.status} ${await response.text()}`);
  report.genre_links = (await response.json()).length;
}
report.status = report.updated === rows.length && !report.failed.length ? "complete" : "incomplete";
await writeFile(resolve(dataDir, "sync-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`유료게임 동기화: ${report.updated}/${rows.length}, 장르 연결 ${report.genre_links}, 실패 ${report.failed.length}`);
if (report.status !== "complete") process.exitCode = 1;
