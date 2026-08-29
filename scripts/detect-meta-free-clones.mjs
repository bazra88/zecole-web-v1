import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-free");
const discovery = JSON.parse(await readFile(resolve(dataDir, "discovery.json"), "utf8"));
const maxDistance = 8;

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

function hamming(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = left[index] ^ right[index];
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

async function fingerprint(game) {
  const response = await fetch(game.thumbnail_url, {
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" },
  });
  if (!response.ok) throw new Error(`${game.name}: 이미지 조회 실패 ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const { data } = await sharp(bytes).resize(17, 16, { fit: "cover" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const differenceHash = Buffer.alloc(32);
  let bit = 0;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      if (data[y * 17 + x] > data[y * 17 + x + 1]) differenceHash[bit >> 3] |= 1 << (bit & 7);
      bit += 1;
    }
  }
  return {
    meta_id: String(game.meta_id), name: game.name, review_count: Number(game.review_count) || 0, origin: game.origin,
    thumbnail_url: game.thumbnail_url, byte_sha256: createHash("sha256").update(bytes).digest("hex"),
    difference_hash: differenceHash.toString("hex"), hash_bytes: differenceHash,
  };
}

const existingEndpoint = new URL(`${supabaseUrl}/rest/v1/games`);
existingEndpoint.searchParams.set("select", "meta_product_id,name,review_count,source_image_url");
existingEndpoint.searchParams.set("pricing_type", "in.(free,free_to_play)");
existingEndpoint.searchParams.set("source_image_url", "not.is.null");
const existingResponse = await fetch(existingEndpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!existingResponse.ok) throw new Error(`기존 무료게임 조회 실패: ${existingResponse.status}`);
const existingGames = (await existingResponse.json()).map((game) => ({
  meta_id: game.meta_product_id, name: game.name, review_count: game.review_count,
  thumbnail_url: game.source_image_url, origin: "existing_database",
}));
const candidateGames = discovery.games.filter((game) => game.thumbnail_url).map((game) => ({ ...game, origin: "candidate" }));
const fingerprints = [];
const failures = [];
const queue = [...existingGames, ...candidateGames];
const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length) {
    const game = queue.shift();
    try { fingerprints.push(await fingerprint(game)); }
    catch (error) { failures.push({ meta_id: String(game.meta_id), name: game.name, error: error.message }); }
  }
});
await Promise.all(workers);

const parent = fingerprints.map((_, index) => index);
const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
const unite = (left, right) => { left = find(left); right = find(right); if (left !== right) parent[right] = left; };
const matches = [];
for (let left = 0; left < fingerprints.length; left += 1) {
  for (let right = left + 1; right < fingerprints.length; right += 1) {
    const exact = fingerprints[left].byte_sha256 === fingerprints[right].byte_sha256;
    const distance = hamming(fingerprints[left].hash_bytes, fingerprints[right].hash_bytes);
    if (exact || distance <= maxDistance) {
      unite(left, right);
      matches.push({ left_meta_id: fingerprints[left].meta_id, right_meta_id: fingerprints[right].meta_id, exact, distance });
    }
  }
}

const grouped = new Map();
fingerprints.forEach((game, index) => {
  const key = find(index);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(game);
});
const cloneGroups = [...grouped.values()].filter((games) => games.length > 1).map((games) => {
  games.sort((a, b) => (a.origin === "existing_database" ? -1 : 0) - (b.origin === "existing_database" ? -1 : 0)
    || b.review_count - a.review_count || a.name.localeCompare(b.name));
  const excluded = games.filter((game, index) => game.origin === "candidate" && index > 0);
  return {
    kept_meta_id: games[0].meta_id,
    excluded_meta_ids: excluded.map((game) => game.meta_id),
    games: games.map(({ hash_bytes, ...game }) => game),
  };
});
const excludedMetaIds = cloneGroups.flatMap((group) => group.excluded_meta_ids);
const report = {
  generated_at: new Date().toISOString(), threshold: { algorithm: "dhash-256", max_hamming_distance: maxDistance },
  scanned: fingerprints.length, existing_scanned: existingGames.length, candidates_scanned: candidateGames.length,
  failed: failures.length, clone_groups: cloneGroups.length,
  excluded_count: excludedMetaIds.length, excluded_meta_ids: excludedMetaIds, groups: cloneGroups, matches, failures,
};
await writeFile(resolve(dataDir, "clone-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`복제품 검사: ${fingerprints.length}개 / 유사 썸네일 그룹 ${cloneGroups.length}개 / 제외 ${excludedMetaIds.length}개 / 실패 ${failures.length}개`);
