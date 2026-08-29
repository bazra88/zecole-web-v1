import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-free");
const discoveryPath = resolve(dataDir, "discovery.json");
const sourceUrl = "https://queststoredb.com/free_apps/?category=Games&paginate_by=100&paid_subscription=no&paid_subscription=optional";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const decode = (value = "") => value.replaceAll("&amp;", "&").replaceAll("&#x2F;", "/").replaceAll("\\/", "/");

function attribute(tag, name) {
  return decode((tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)`, "i")) || [])[1]);
}

function officialImage(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = attribute(tag, "property") || attribute(tag, "name");
    if (["og:image", "og:image:secure_url", "twitter:image"].includes(key.toLowerCase())) {
      const content = attribute(tag, "content");
      if (/^https?:\/\//i.test(content)) return content;
    }
  }
  const escaped = (html.match(/"(?:thumbnailUrl|image_url|imageUrl)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]*)*)"/i) || [])[1];
  return escaped ? decode(escaped) : null;
}

function sourceImages(html) {
  const result = new Map();
  for (const match of html.matchAll(/data-tooltip-target="tooltip-(\d+)"/g)) {
    const start = Math.max(0, match.index - 1800);
    const end = Math.min(html.length, match.index + 1800);
    const chunk = html.slice(start, end);
    const tags = chunk.match(/<img\b[^>]*>/gi) || [];
    const cover = tags.find((tag) => /\balt=["'][^"']+ cover["']/i.test(tag));
    const url = cover && (attribute(cover, "src") || attribute(cover, "data-src"));
    if (url && /^https?:\/\//i.test(url)) result.set(match[1], url);
  }
  return result;
}

const report = JSON.parse(await readFile(discoveryPath, "utf8"));
const missing = report.games.filter((game) => !game.thumbnail_url);
const sourceResponse = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" } });
if (!sourceResponse.ok) throw new Error(`무료게임 인덱스 조회 실패: ${sourceResponse.status}`);
const fallbacks = sourceImages(await sourceResponse.text());

let official = 0;
let fallback = 0;
let failed = 0;
const queue = [...missing];
const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length) {
    const game = queue.shift();
    let image = null;
    try {
      const response = await fetch(game.meta_store_url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0" },
      });
      if (response.ok) image = officialImage(await response.text());
    } catch {}
    if (image) {
      game.thumbnail_url = image;
      game.thumbnail_source = "official_meta";
      official += 1;
    } else if (fallbacks.get(String(game.meta_id))) {
      game.thumbnail_url = fallbacks.get(String(game.meta_id));
      game.thumbnail_source = "queststoredb_fallback";
      fallback += 1;
    } else {
      failed += 1;
    }
  }
});
await Promise.all(workers);

report.thumbnail_enrichment = { generated_at: new Date().toISOString(), attempted: missing.length, official, fallback, failed };
const fields = ["meta_id", "name", "slug", "rating", "review_count", "genre", "pricing_type", "meta_store_url", "thumbnail_url", "thumbnail_source", "verification_status"];
const csv = [fields.map(csvCell).join(","), ...report.games.map((game) => fields.map((field) => csvCell(game[field])).join(","))].join("\n");
await Promise.all([
  writeFile(discoveryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(resolve(dataDir, "discovery.csv"), `${csv}\n`, "utf8"),
]);
console.log(`썸네일 보완: 공식 ${official} / 보조 인덱스 ${fallback} / 실패 ${failed}`);

