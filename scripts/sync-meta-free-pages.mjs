import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const reportPath = resolve(root, "data", "meta-free", "diff-report.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));
let localEnv = {};
try {
  localEnv = Object.fromEntries((await readFile(resolve(root, ".env.local"), "utf8"))
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const supabaseKey = apply ? secretKey : publicKey;
if (!rawSupabaseUrl || !supabaseKey) {
  throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
}
const supabaseUrl = rawSupabaseUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const updates = report.rows
  .filter((row) => row.status === "review_required")
  .map((row) => {
    const payload = {};
    if (row.changes.includes("name") && row.name) payload.name = row.name;
    if (row.changes.includes("rating") && row.meta_rating != null) payload.rating = row.meta_rating;
    if (row.changes.includes("review_count") && row.meta_review_count != null) payload.review_count = row.meta_review_count;
    if (row.changes.includes("description") && row.parsed_description) payload.description = row.parsed_description;
    if (row.changes.includes("source_image_url") && row.parsed_thumbnail_url) payload.source_image_url = row.parsed_thumbnail_url;
    const devices = (row.parsed_supported_devices || []).map(String);
    const supports = (needle) => devices.some((device) => device.toLowerCase().includes(needle));
    if (row.changes.includes("supports_quest_2")) payload.supports_quest_2 = supports("quest 2");
    if (row.changes.includes("supports_quest_3")) payload.supports_quest_3 = supports("quest 3");
    if (row.changes.includes("supports_quest_3s")) payload.supports_quest_3s = supports("quest 3s");
    return { id: row.id, name: row.name, changes: row.changes, payload };
  })
  .filter((row) => Object.keys(row.payload).length);

const result = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", attempted: updates.length, succeeded: 0, failed: [], updates };

if (!apply) {
  console.log(`동기화 미리보기: ${updates.length}개 행, DB 변경 없음`);
  console.log("실제 반영은 npm run data:free:sync -- --apply 로 실행합니다.");
} else {
  for (const update of updates) {
    const endpoint = new URL(`${supabaseUrl}/rest/v1/games`);
    endpoint.searchParams.set("id", `eq.${update.id}`);
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(update.payload),
    });
    const body = response.ok ? await response.json().catch(() => []) : await response.text();
    if (response.ok && Array.isArray(body) && body.length > 0) result.succeeded += 1;
    else result.failed.push({ id: update.id, status: response.status, body: Array.isArray(body) ? "수정된 행이 없습니다 (RLS 또는 조건 확인 필요)" : String(body).slice(0, 300) });
  }
  console.log(`동기화 완료: ${result.succeeded}/${result.attempted}개 반영`);
  if (result.failed.length) console.log(`실패: ${result.failed.length}개 (리포트 확인 필요)`);
}

await writeFile(resolve(root, "data", "meta-free", "sync-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`리포트: ${resolve(root, "data", "meta-free", "sync-report.json")}`);
if (result.failed.length) process.exitCode = 1;
