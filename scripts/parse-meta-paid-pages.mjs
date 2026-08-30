import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-paid");
const cacheDir = resolve(root, ".meta-cache", "paid-games");
const candidates = JSON.parse(await readFile(resolve(dataDir, "candidates.json"), "utf8"));
const files = new Set(await readdir(cacheDir));
const first = (value) => Array.isArray(value) ? value[0] : value;
const imageUrl = (value) => { const item = first(value); return typeof item === "string" ? item : item?.url || item?.contentUrl || null; };
function ldApp(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      if (app) return app;
    } catch {}
  }
  return null;
}
const rows = [];
for (const game of candidates.games) {
  const id = String(game.meta_product_id || game.meta_store_url?.match(/\b\d{10,}\b/)?.[0] || "");
  const html = files.has(`${id}.html`) ? await readFile(resolve(cacheDir, `${id}.html`), "utf8") : "";
  const app = html && ldApp(html);
  const aggregate = app?.aggregateRating || {};
  const offer = first(app?.offers) || {};
  const author = first(app?.author);
  const publisher = first(app?.publisher);
  rows.push({
    id: game.id, meta_id: id, source_name: game.name, meta_store_url: game.meta_store_url,
    title: app?.name || null, rating: Number(aggregate.ratingValue) || null, review_count: Number(aggregate.ratingCount) || null,
    description: app?.description || null, genre: first(app?.applicationSubCategory || app?.applicationCategory) || null,
    supported_devices: Array.isArray(app?.availableOnDevice) ? app.availableOnDevice : [], thumbnail_url: imageUrl(app?.image || app?.thumbnailUrl),
    price: offer.price == null ? null : Number(offer.price), currency: offer.priceCurrency || null, availability: offer.availability || null,
    release_date: app?.datePublished || app?.releaseDate || null,
    developer: typeof author === "string" ? author : author?.name || null,
    publisher: typeof publisher === "string" ? publisher : publisher?.name || null,
    parse_status: app ? "parsed" : "missing_ld_json",
  });
}
const missing = rows.filter((row) => row.parse_status !== "parsed");
const report = { generated_at: new Date().toISOString(), offset: candidates.offset, count: rows.length, parsed: rows.length - missing.length, missing: missing.length, games: rows };
await writeFile(resolve(dataDir, "parsed.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`유료게임 세부 파싱: ${report.parsed}/${report.count}, 실패 ${report.missing}`);
if (missing.length) console.log("파싱 누락 게임은 이번 동기화에서 보류하고 다음 배치를 계속합니다.");
