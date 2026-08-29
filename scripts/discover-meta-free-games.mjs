import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const outputDir = resolve(root, "data", "meta-free");
const sourceUrl = "https://queststoredb.com/free_apps/?category=Games&paginate_by=100&paid_subscription=no&paid_subscription=optional";
const minReviews = 500;

const clean = (value = "") => value.replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replace(/\s+/g, " ").trim();
const slugify = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const reviewCount = (value = "") => {
  const text = clean(value).replaceAll(",", "").toUpperCase();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return 0;
  if (text.includes("K")) return Math.round(number * 1_000);
  if (text.includes("M")) return Math.round(number * 1_000_000);
  return Math.round(number);
};

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
}

function parseLdJson(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1].trim());
      const graph = Array.isArray(value?.["@graph"]) ? value["@graph"] : [value];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      if (app) return app;
    } catch {}
  }
  return null;
}

let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawUrl || !key) throw new Error("Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const sourceResponse = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" } });
if (!sourceResponse.ok) throw new Error(`무료게임 인덱스 조회 실패: ${sourceResponse.status}`);
const sourceHtml = await sourceResponse.text();
const anchors = [...sourceHtml.matchAll(/data-tooltip-target="tooltip-(\d+)"/g)];
const indexed = anchors.map((anchor, index) => {
  const metaId = anchor[1];
  const end = index + 1 < anchors.length ? anchors[index + 1].index : anchor.index + 9000;
  const chunk = sourceHtml.slice(Math.max(0, anchor.index - 350), end);
  const name = clean((chunk.match(new RegExp(`alt="([^"]+) cover"`)) || [])[1]);
  const count = reviewCount((chunk.match(new RegExp(`id="tooltip-${metaId}"[\\s\\S]*?<span[^>]*>([\\s\\S]*?)<\\/span>\\s*ratings`)) || [])[1]);
  return { meta_id: metaId, source_name: name, source_review_count: count, meta_store_url: `https://www.meta.com/experiences/${metaId}/` };
}).filter((game) => game.source_name && game.source_review_count >= minReviews);

const existing = [];
for (let offset = 0; ; offset += 1000) {
  const endpoint = new URL(`${supabaseUrl}/rest/v1/games`);
  endpoint.searchParams.set("select", "id,name,slug,meta_store_url,affiliate_url");
  const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + 999}` } });
  if (!response.ok) throw new Error(`기존 게임 조회 실패: ${response.status}`);
  const page = await response.json();
  existing.push(...page);
  if (page.length < 1000) break;
}

const existingMetaIds = new Set(existing.flatMap((game) => `${game.meta_store_url || ""} ${game.affiliate_url || ""}`.match(/\b\d{10,}\b/g) || []));
const existingNames = new Set(existing.map((game) => game.name?.trim().toLowerCase()).filter(Boolean));
const existingSlugs = new Set(existing.map((game) => game.slug?.trim().toLowerCase()).filter(Boolean));
const unseen = indexed.filter((game) => !existingMetaIds.has(game.meta_id) && !existingNames.has(game.source_name.toLowerCase()) && !existingSlugs.has(slugify(game.source_name)));

async function verifyOfficial(game) {
  try {
    const response = await fetch(game.meta_store_url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" } });
    const app = response.ok ? parseLdJson(await response.text()) : null;
    if (!app) return null;
  const aggregate = app?.aggregateRating || {};
  const officialReviews = Number(aggregate.ratingCount) || 0;
    if (officialReviews < minReviews) return null;
  const image = Array.isArray(app.image) ? app.image[0] : app.image || app.thumbnailUrl;
    return {
    meta_id: game.meta_id,
    name: app.name || game.source_name,
    slug: slugify(app.name || game.source_name) || `meta-${game.meta_id}`,
    rating: Number(aggregate.ratingValue) || null,
    review_count: officialReviews,
    description: app.description || null,
    genre: Array.isArray(app.applicationSubCategory) ? app.applicationSubCategory[0] : app.applicationSubCategory || app.applicationCategory || null,
    supported_devices: Array.isArray(app.availableOnDevice) ? app.availableOnDevice : [],
    thumbnail_url: typeof image === "string" ? image : image?.url || image?.contentUrl || null,
    pricing_type: "free",
    current_price: 0,
    currency: "USD",
    meta_store_url: game.meta_store_url,
    discovery_source: sourceUrl,
    verification_status: "verified_meta",
    };
  } catch {
    return null;
  }
}

const discovered = [];
const queue = [...unseen];
const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length) {
    const game = queue.shift();
    const verified = await verifyOfficial(game);
    if (verified) discovered.push(verified);
  }
});
await Promise.all(workers);
discovered.sort((a, b) => b.review_count - a.review_count || a.name.localeCompare(b.name));

const report = { generated_at: new Date().toISOString(), min_reviews: minReviews, indexed_count: indexed.length, existing_rows_scanned: existing.length, unseen_count: unseen.length, discovered_count: discovered.length, games: discovered };
const fields = ["meta_id", "name", "slug", "rating", "review_count", "genre", "pricing_type", "meta_store_url", "thumbnail_url", "verification_status"];
const csv = [fields.map(csvCell).join(","), ...discovered.map((game) => fields.map((field) => csvCell(game[field])).join(","))].join("\n");
await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "discovery.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "discovery.csv"), `${csv}\n`, "utf8"),
]);
console.log(`신규 무료게임 발견: ${discovered.length}개 (공식 Meta 리뷰 ${minReviews}개 이상)`);
