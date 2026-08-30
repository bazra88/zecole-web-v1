import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-free");
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawUrl || !key) throw new Error("Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const url = new URL(`${supabaseUrl}/rest/v1/games`);
url.searchParams.set("select", "id,meta_product_id,name,slug,description,rating,review_count,source_image_url,meta_store_url,pricing_type,current_price,supports_quest_2,supports_quest_3,supports_quest_3s,game_genres(genre_id)");
url.searchParams.set("source_status", "eq.official_meta_discovery_reviewed");
url.searchParams.set("order", "review_count.desc");
const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!response.ok) throw new Error(`신규 무료게임 조회 실패: ${response.status}`);
const games = await response.json();

const rows = games.map((game) => {
  const issues = [];
  if (!game.name?.trim()) issues.push("missing_name");
  if (!game.slug?.trim()) issues.push("missing_slug");
  if (!game.description?.trim()) issues.push("missing_description");
  if (game.rating == null || Number(game.rating) < 0 || Number(game.rating) > 5) issues.push("invalid_rating");
  if (!Number.isFinite(Number(game.review_count)) || Number(game.review_count) < 500) issues.push("invalid_review_count");
  if (!game.source_image_url) issues.push("missing_thumbnail");
  if (!game.meta_store_url) issues.push("missing_store_url");
  if (!game.game_genres?.length) issues.push("missing_genre");
  if (![game.supports_quest_2, game.supports_quest_3, game.supports_quest_3s].some(Boolean)) issues.push("missing_devices");
  if (!["free", "free_to_play"].includes(game.pricing_type) || Number(game.current_price) !== 0) issues.push("invalid_free_price");
  return { meta_id: game.meta_product_id, name: game.name, slug: game.slug, thumbnail_url: game.source_image_url, issues, thumbnail_status: null };
});

const queue = rows.filter((row) => row.thumbnail_url);
const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
  while (queue.length) {
    const row = queue.shift();
    try {
      const imageResponse = await fetch(row.thumbnail_url, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: "image/*", Range: "bytes=0-1023", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" },
      });
      const contentType = imageResponse.headers.get("content-type") || "";
      row.thumbnail_status = imageResponse.status;
      if (!imageResponse.ok || !contentType.startsWith("image/")) row.issues.push("thumbnail_unavailable");
    } catch {
      row.thumbnail_status = 0;
      row.issues.push("thumbnail_unavailable");
    }
  }
});
await Promise.all(workers);

const issueCounts = Object.fromEntries([...new Set(rows.flatMap((row) => row.issues))]
  .map((issue) => [issue, rows.filter((row) => row.issues.includes(issue)).length]));
const report = {
  generated_at: new Date().toISOString(), scanned: rows.length,
  passed: rows.filter((row) => !row.issues.length).length,
  failed: rows.filter((row) => row.issues.length).length,
  issue_counts: issueCounts, rows,
};
await writeFile(resolve(dataDir, "quality-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`무료게임 품질 검사: ${report.scanned}개 / 통과 ${report.passed} / 문제 ${report.failed}`);
if (report.failed) process.exitCode = 1;

