import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const parsed = JSON.parse(await readFile(resolve(root, "data", "meta-free", "parsed.json"), "utf8"));
let localEnv = {};
try {
  localEnv = Object.fromEntries((await readFile(resolve(root, ".env.local"), "utf8"))
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawSupabaseUrl || !supabaseKey) throw new Error("Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawSupabaseUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const ids = parsed.games.map((game) => game.id);
const endpoint = new URL(`${supabaseUrl}/rest/v1/games`);
endpoint.searchParams.set("select", "id,name,rating,review_count,image_path,source_image_url,description,supports_quest_2,supports_quest_3,supports_quest_3s,pricing_type,meta_store_url");
endpoint.searchParams.set("id", `in.(${ids.join(",")})`);
const response = await fetch(endpoint, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
if (!response.ok) throw new Error(`현재 DB 조회 실패 (${response.status}): ${(await response.text()).slice(0, 300)}`);
const current = await response.json();
const byId = new Map(current.map((game) => [game.id, game]));

const rows = parsed.games.map((meta) => {
  const db = byId.get(meta.id);
  const changes = [];
  if (!db) changes.push("missing_db_row");
  else {
    if (meta.title && meta.title !== db.name) changes.push("name");
    if (meta.rating != null && Number(meta.rating) !== Number(db.rating)) changes.push("rating");
    if (meta.review_count != null && Number(meta.review_count) !== Number(db.review_count)) changes.push("review_count");
    if (meta.description && meta.description !== db.description) changes.push("description");
    if (meta.thumbnail_url && meta.thumbnail_url !== db.source_image_url) changes.push("source_image_url");
    const devices = (meta.supported_devices || []).map(String);
    const supports = (needle) => devices.some((device) => device.toLowerCase().includes(needle));
    if (supports("quest 2") !== Boolean(db.supports_quest_2)) changes.push("supports_quest_2");
    if (supports("quest 3") !== Boolean(db.supports_quest_3)) changes.push("supports_quest_3");
    if (supports("quest 3s") !== Boolean(db.supports_quest_3s)) changes.push("supports_quest_3s");
    if (db.pricing_type !== "free" && db.pricing_type !== "free_to_play") changes.push("pricing_type");
    if (!db.meta_store_url) changes.push("meta_store_url");
  }
  return {
    id: meta.id,
    name: meta.title || meta.source_name,
    meta_store_url: meta.meta_store_url,
    db_rating: db?.rating ?? null,
    meta_rating: meta.rating,
    db_review_count: db?.review_count ?? null,
    meta_review_count: meta.review_count,
    parsed_description: meta.description,
    parsed_genre: meta.genre,
    parsed_supported_devices: meta.supported_devices,
    parsed_thumbnail_url: meta.thumbnail_url,
    changes,
    status: changes.length ? "review_required" : "in_sync",
  };
});

const report = {
  generated_at: new Date().toISOString(),
  source_count: parsed.games.length,
  db_rows_found: current.length,
  review_required: rows.filter((row) => row.status === "review_required").length,
  in_sync: rows.filter((row) => row.status === "in_sync").length,
  rows,
};
await writeFile(resolve(root, "data", "meta-free", "diff-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`대조 완료: ${report.in_sync}개 일치, ${report.review_required}개 검토 필요`);
console.log(`DB 행 확인: ${report.db_rows_found}/${report.source_count}`);
console.log(`리포트: ${resolve(root, "data", "meta-free", "diff-report.json")}`);
