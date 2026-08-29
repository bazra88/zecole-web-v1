import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-free");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=INSERT_FREE_GAMES");
if (apply && !confirmed) throw new Error("실제 등록에는 --confirm=INSERT_FREE_GAMES 확인값이 필요합니다.");

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const key = apply ? process.env.SUPABASE_SECRET_KEY : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const preview = JSON.parse(await readFile(resolve(dataDir, "insert-preview.json"), "utf8"));
const ready = preview.rows.filter((row) => row.status === "ready");

async function getExisting() {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${supabaseUrl}/rest/v1/games`);
    url.searchParams.set("select", "id,name,slug,meta_product_id,meta_catalog_item_id");
    const response = await fetch(url, { headers: { ...headers, Range: `${offset}-${offset + 999}` } });
    if (!response.ok) throw new Error(`기존 게임 재조회 실패: ${response.status}`);
    const page = await response.json();
    result.push(...page);
    if (page.length < 1000) return result;
  }
}

const existing = await getExisting();
const ids = new Set(existing.flatMap((game) => [game.meta_product_id, game.meta_catalog_item_id].filter(Boolean).map(String)));
const slugs = new Set(existing.map((game) => game.slug));
const conflicts = ready.filter((row) => ids.has(String(row.payload.meta_product_id)) || ids.has(String(row.payload.meta_catalog_item_id)) || slugs.has(row.payload.slug));
const unknownGenres = [...new Set(ready.map((row) => row.genre).filter(Boolean))].filter((name) =>
  !["격투", "샌드박스", "소셜", "슈팅 게임", "스포츠", "아케이드", "어드벤처", "월드 만들기", "플랫폼 게임", "액션", "롤플레잉"].includes(name));
const report = {
  generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", candidates: ready.length,
  existing_rows_scanned: existing.length, conflicts: conflicts.map((row) => row.payload.meta_product_id), unknown_genres: unknownGenres,
  inserted_games: 0, linked_genres: 0, status: "pending",
};
if (conflicts.length || unknownGenres.length) {
  report.status = "blocked";
  await writeFile(resolve(dataDir, "insert-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  throw new Error(`등록 차단: DB 충돌 ${conflicts.length}개, 미등록 장르 ${unknownGenres.length}개`);
}

if (!apply) {
  report.status = "ready";
  await writeFile(resolve(dataDir, "insert-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`신규 무료게임 등록 미리보기: ${ready.length}개, DB 변경 없음`);
  process.exit(0);
}

const requiredGenres = [...new Set(ready.map((row) => row.genre).filter(Boolean))];
const genrePayload = requiredGenres.map((name) => ({ name, slug: name === "액션" ? "action" : name === "롤플레잉" ? "role-playing" : `meta-${["격투", "샌드박스", "소셜", "슈팅 게임", "스포츠", "아케이드", "어드벤처", "월드 만들기", "플랫폼 게임"].indexOf(name) + 1}` }));
const genreUrl = new URL(`${supabaseUrl}/rest/v1/genres`);
genreUrl.searchParams.set("on_conflict", "name");
let response = await fetch(genreUrl, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(genrePayload) });
if (!response.ok) throw new Error(`장르 준비 실패: ${response.status} ${await response.text()}`);

for (let index = 0; index < ready.length; index += 20) {
  response = await fetch(`${supabaseUrl}/rest/v1/games`, {
    method: "POST", headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(ready.slice(index, index + 20).map((row) => row.payload)),
  });
  if (!response.ok) throw new Error(`게임 등록 실패(${index}-${index + 19}): ${response.status} ${await response.text()}`);
  report.inserted_games += (await response.json()).length;
}

const metaIds = ready.map((row) => row.payload.meta_product_id);
const gamesUrl = new URL(`${supabaseUrl}/rest/v1/games`);
gamesUrl.searchParams.set("select", "id,meta_product_id");
gamesUrl.searchParams.set("meta_product_id", `in.(${metaIds.join(",")})`);
const genresUrl = new URL(`${supabaseUrl}/rest/v1/genres`);
genresUrl.searchParams.set("select", "id,name");
const [gamesResponse, genresResponse] = await Promise.all([fetch(gamesUrl, { headers }), fetch(genresUrl, { headers })]);
if (!gamesResponse.ok || !genresResponse.ok) throw new Error("등록 후 게임/장르 ID 조회에 실패했습니다.");
const inserted = new Map((await gamesResponse.json()).map((game) => [String(game.meta_product_id), game.id]));
const genres = new Map((await genresResponse.json()).map((genre) => [genre.name, genre.id]));
const links = ready.map((row) => ({ game_id: inserted.get(String(row.payload.meta_product_id)), genre_id: genres.get(row.genre) })).filter((link) => link.game_id && link.genre_id);
response = await fetch(`${supabaseUrl}/rest/v1/game_genres`, {
  method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(links),
});
if (!response.ok) throw new Error(`장르 연결 실패: ${response.status} ${await response.text()}`);
report.linked_genres = (await response.json()).length;
report.status = report.inserted_games === ready.length && report.linked_genres === links.length ? "complete" : "incomplete";
await writeFile(resolve(dataDir, "insert-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`신규 무료게임 등록: ${report.inserted_games}개 / 장르 연결 ${report.linked_genres}개`);
if (report.status !== "complete") process.exitCode = 1;

