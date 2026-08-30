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
function relayApp(html, metaId) {
  const candidates = [];
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        if (value.length) target[key] = value;
      } else if (typeof value === "object") {
        target[key] = merge(typeof target[key] === "object" && !Array.isArray(target[key]) ? target[key] : {}, value);
      } else target[key] = value;
    }
    return target;
  };
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    const valueId = String(value.id || "");
    const isMainFragment = valueId === metaId || (!valueId && value.__isAppStoreItem === "Application");
    if (!Array.isArray(value) && isMainFragment && (value.display_name || value.display_long_description || value.quality_rating_count != null || value.current_offer)) {
      const score = ["current_offer", "display_long_description", "quality_rating_count", "genre_names", "supported_platforms_i18n", "hero_image"].filter((key) => value[key] != null).length;
      candidates.push({ value, score });
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.score - b.score).reduce((combined, candidate) => merge(combined, candidate.value), {});
}
function relayImage(app) {
  return app?.hero_image?.uri || app?.cover_square_image?.uri || app?.image?.uri || null;
}
function relayPrice(app) {
  const price = app?.current_offer?.price;
  const amount = Number(price?.offset_amount);
  return Number.isFinite(amount) ? amount / 100 : null;
}
const rows = [];
for (const game of candidates.games) {
  const id = String(game.meta_product_id || game.meta_store_url?.match(/\b\d{10,}\b/)?.[0] || "");
  const html = files.has(`${id}.html`) ? await readFile(resolve(cacheDir, `${id}.html`), "utf8") : "";
  const alreadyReviewed = game.source_status === "official_meta_paid_reviewed";
  const app = !alreadyReviewed && html && ldApp(html);
  const relayId = id.match(/\d{10,}$/)?.[0] || id;
  const relay = !alreadyReviewed && html && !app ? relayApp(html, relayId) : null;
  const aggregate = app?.aggregateRating || {};
  const offer = first(app?.offers) || {};
  const author = first(app?.author);
  const publisher = first(app?.publisher);
  const parsed = Boolean(app || relay);
  rows.push({
    id: game.id, meta_id: id, source_name: game.name, meta_store_url: game.meta_store_url,
    title: app?.name || relay?.display_name || null,
    rating: Number(aggregate.ratingValue || relay?.quality_rating_i18n_score_string) || null,
    review_count: Number(aggregate.ratingCount || relay?.quality_rating_count || relay?.quality_rating_i18n_count_string) || null,
    description: app?.description || relay?.display_long_description || relay?.display_machine_translated_long_description || null,
    genre: first(app?.applicationSubCategory || app?.applicationCategory || relay?.genre_names) || null,
    supported_devices: Array.isArray(app?.availableOnDevice) ? app.availableOnDevice : Array.isArray(relay?.supported_platforms_i18n) ? relay.supported_platforms_i18n : [],
    thumbnail_url: imageUrl(app?.image || app?.thumbnailUrl) || relayImage(relay),
    price: app ? (offer.price == null ? null : Number(offer.price)) : relayPrice(relay),
    currency: offer.priceCurrency || relay?.current_offer?.price?.currency || null,
    availability: offer.availability || null,
    release_date: app?.datePublished || app?.releaseDate || null,
    developer: typeof author === "string" ? author : author?.name || relay?.developer_name || null,
    publisher: typeof publisher === "string" ? publisher : publisher?.name || relay?.publisher_name || null,
    parse_status: alreadyReviewed ? "already_reviewed" : parsed ? (relay ? "parsed_relay_json" : "parsed") : "missing_meta_data",
  });
}
const skipped = rows.filter((row) => row.parse_status === "already_reviewed");
const missing = rows.filter((row) => row.parse_status === "missing_meta_data");
const parsed = rows.filter((row) => ["parsed", "parsed_relay_json"].includes(row.parse_status));
const report = { generated_at: new Date().toISOString(), offset: candidates.offset, count: rows.length, parsed: parsed.length, skipped: skipped.length, missing: missing.length, games: rows };
await writeFile(resolve(dataDir, "parsed.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`유료게임 세부 파싱: ${report.parsed}/${report.count}, 실패 ${report.missing}`);
if (missing.length) console.log("파싱 누락 게임은 이번 동기화에서 보류하고 다음 배치를 계속합니다.");
