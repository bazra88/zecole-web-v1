import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-free");
const inputPath = resolve(dataDir, "discovery.json");
const minReviews = 500;

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const normalizeName = (value = "") => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const normalizeSlug = (value = "") => value.toLowerCase().normalize("NFKD")
  .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const deviceSupport = (devices, target) => devices.some((device) => {
  const normalized = String(device).toLowerCase().replace(/\s+/g, " ");
  if (target === "quest 3") return normalized.includes("quest 3") && !normalized.includes("quest 3s");
  return normalized.includes(target);
});

let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawUrl || !key) throw new Error("Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const source = JSON.parse(await readFile(inputPath, "utf8"));
const existing = [];
for (let offset = 0; ; offset += 1000) {
  const endpoint = new URL(`${supabaseUrl}/rest/v1/games`);
  endpoint.searchParams.set("select", "id,name,slug,meta_product_id,meta_catalog_item_id,meta_store_url,affiliate_url");
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}` },
  });
  if (!response.ok) throw new Error(`기존 게임 조회 실패: ${response.status}`);
  const page = await response.json();
  existing.push(...page);
  if (page.length < 1000) break;
}

const existingIds = new Set(existing.flatMap((game) => [game.meta_product_id, game.meta_catalog_item_id]
  .filter(Boolean).map(String)));
const existingUrlIds = new Set(existing.flatMap((game) => `${game.meta_store_url || ""} ${game.affiliate_url || ""}`
  .match(/\b\d{10,}\b/g) || []));
const existingNames = new Set(existing.map((game) => normalizeName(game.name)).filter(Boolean));
const usedSlugs = new Set(existing.map((game) => normalizeSlug(game.slug)).filter(Boolean));
const seenIds = new Set();
const seenNames = new Set();
const rows = [];

for (const game of source.games || []) {
  const metaId = String(game.meta_id || "").trim();
  const nameKey = normalizeName(game.name);
  const duplicateReasons = [];
  if (existingIds.has(metaId) || existingUrlIds.has(metaId)) duplicateReasons.push("existing_meta_id");
  if (existingNames.has(nameKey)) duplicateReasons.push("existing_name");
  if (seenIds.has(metaId)) duplicateReasons.push("batch_meta_id");
  if (seenNames.has(nameKey)) duplicateReasons.push("batch_name");
  seenIds.add(metaId);
  seenNames.add(nameKey);

  let slug = normalizeSlug(game.slug || game.name) || `meta-${metaId}`;
  let slugAdjusted = false;
  if (usedSlugs.has(slug)) {
    slug = `${slug}-${metaId}`;
    slugAdjusted = true;
  }
  usedSlugs.add(slug);

  const devices = Array.isArray(game.supported_devices) ? game.supported_devices : [];
  const blockingIssues = [];
  const warnings = [];
  if (!metaId || !/^\d+$/.test(metaId)) blockingIssues.push("invalid_meta_id");
  if (!String(game.name || "").trim()) blockingIssues.push("missing_name");
  if (!Number.isFinite(Number(game.review_count)) || Number(game.review_count) < minReviews) blockingIssues.push("review_count_below_threshold");
  if (!String(game.description || "").trim()) blockingIssues.push("missing_description");
  if (!game.thumbnail_url) blockingIssues.push("missing_thumbnail");
  if (!game.genre) warnings.push("missing_genre");
  if (!devices.length) warnings.push("missing_supported_devices");
  if (slugAdjusted) warnings.push("slug_adjusted");

  const payload = {
    meta_product_id: metaId,
    meta_catalog_id: null,
    meta_catalog_item_id: metaId,
    name: String(game.name || "").trim(),
    slug,
    affiliate_url: null,
    meta_store_url: game.meta_store_url || `https://www.meta.com/experiences/${metaId}/`,
    image_path: null,
    source_image_url: game.thumbnail_url || null,
    current_price: 0,
    original_price: 0,
    currency: game.currency || "USD",
    description: String(game.description || "").trim() || null,
    rating: game.rating == null ? null : Number(game.rating),
    review_count: Number(game.review_count),
    supports_korean: null,
    supports_quest_2: deviceSupport(devices, "quest 2"),
    supports_quest_3: deviceSupport(devices, "quest 3"),
    supports_quest_3s: deviceSupport(devices, "quest 3s"),
    source_status: "official_meta_discovery_reviewed",
    active: true,
    pricing_type: "free",
    affiliate_discount_active: false,
    region_restricted: false,
  };
  rows.push({
    status: duplicateReasons.length ? "duplicate" : blockingIssues.length ? "blocked" : "ready",
    duplicate_reasons: duplicateReasons,
    blocking_issues: blockingIssues,
    warnings,
    genre: game.genre || null,
    payload,
  });
}

const counts = rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {});
const report = {
  generated_at: new Date().toISOString(),
  source_generated_at: source.generated_at || null,
  min_reviews: minReviews,
  existing_rows_scanned: existing.length,
  total_candidates: rows.length,
  counts: { ready: counts.ready || 0, blocked: counts.blocked || 0, duplicate: counts.duplicate || 0 },
  insertion_performed: false,
  blocking_issue_counts: Object.fromEntries([...new Set(rows.flatMap((row) => row.blocking_issues))]
    .map((issue) => [issue, rows.filter((row) => row.blocking_issues.includes(issue)).length])),
  warning_counts: Object.fromEntries([...new Set(rows.flatMap((row) => row.warnings))]
    .map((warning) => [warning, rows.filter((row) => row.warnings.includes(warning)).length])),
  rows,
};
const fields = ["status", "meta_product_id", "name", "slug", "rating", "review_count", "genre", "source_image_url", "blocking_issues", "warnings"];
const csvRows = rows.map((row) => ({ ...row.payload, status: row.status, genre: row.genre,
  blocking_issues: row.blocking_issues.join("|"), warnings: row.warnings.join("|") }));
const csv = [fields.map(csvCell).join(","), ...csvRows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n");

await mkdir(dataDir, { recursive: true });
await Promise.all([
  writeFile(resolve(dataDir, "insert-preview.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(resolve(dataDir, "insert-preview.csv"), `${csv}\n`, "utf8"),
]);
console.log(`등록 전 검사: 전체 ${rows.length}개 / 준비 ${report.counts.ready} / 차단 ${report.counts.blocked} / 중복 ${report.counts.duplicate}`);
console.log(`DB 변경 없음. 리포트: ${resolve(dataDir, "insert-preview.json")}`);

