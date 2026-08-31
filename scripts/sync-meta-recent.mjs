import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const root = process.cwd();
const reportDir = resolve(root, "data", "meta-recent");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_META_RECENT");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_META_RECENT가 필요합니다.");

const SOURCE_URL = "https://www.meta.com/en-us/experiences/section/3878844519028756/?sort_order=release_date";
const DETAIL_DELAY_MS = Math.max(500, Number(process.env.META_RECENT_DETAIL_DELAY_MS || 1200));
const MAX_PRODUCTS = Math.max(40, Number(process.env.META_RECENT_MAX_PRODUCTS || 240));
const STABLE_ROUNDS = Math.max(3, Number(process.env.META_RECENT_STABLE_ROUNDS || 8));
const CUTOFF_DAYS = Math.max(31, Number(process.env.META_RECENT_CUTOFF_DAYS || 62));
const CARD_BADGES = ["Top Selling", "Top Rated", "Best Seller", "Free", "우수 판매자", "높은 평점", "베스트셀러", "무료"];
const GENRE_NAMES = {
  Fighting: "격투", Narrative: "내러티브", Sandbox: "샌드박스", Survival: "서바이벌", Shooter: "슈팅 게임",
  Sports: "스포츠", Simulation: "시뮬레이션", Arcade: "아케이드", Action: "액션", Adventure: "어드벤처",
  Strategy: "전략", Tabletop: "테이블탑", Puzzle: "퍼즐", Platformer: "플랫폼 게임", Education: "학습",
  Party: "파티 게임", Creativity: "창의성", "Role Playing": "롤플레잉", "World Creation": "월드 만들기",
  "Travel & Exploration": "여행/탐험", "Fitness & Wellness": "피트니스/웰빙",
};
const GENRE_SLUGS = {
  "격투": "fighting", "내러티브": "narrative", "샌드박스": "sandbox", "서바이벌": "survival", "슈팅 게임": "shooting",
  "스포츠": "sports", "시뮬레이션": "simulation", "아케이드": "arcade", "액션": "action", "어드벤처": "adventure",
  "전략": "strategy", "테이블탑": "tabletop", "퍼즐": "puzzle", "플랫폼 게임": "platform", "학습": "education",
  "파티 게임": "party", "창의성": "creativity", "롤플레잉": "role-playing", "월드 만들기": "world-creation",
  "여행/탐험": "travel-exploration", "피트니스/웰빙": "fitness-wellness",
};
const cutoff = new Date(Date.now() - CUTOFF_DAYS * 86_400_000);
cutoff.setUTCHours(0, 0, 0, 0);

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SECRET_KEY;
const key = apply ? secretKey : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const first = (value) => Array.isArray(value) ? value[0] : value;
const normalizedSlug = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const normalizedDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const korean = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
};
const imageUrl = (value) => {
  const item = first(value);
  return typeof item === "string" ? item : item?.url || item?.contentUrl || null;
};
const money = (value) => {
  const amount = Number(value?.offset_amount);
  return Number.isFinite(amount) ? amount / 100 : null;
};
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
    for (const [property, value] of Object.entries(source || {})) {
      if (value == null) continue;
      if (Array.isArray(value)) { if (value.length) target[property] = value; }
      else if (typeof value === "object") target[property] = merge(typeof target[property] === "object" && !Array.isArray(target[property]) ? target[property] : {}, value);
      else target[property] = value;
    }
    return target;
  };
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    const id = String(value.id || "");
    const main = id === metaId || (!id && value.__isAppStoreItem === "Application");
    if (!Array.isArray(value) && main && (value.display_name || value.current_offer || value.release_info)) {
      const score = ["current_offer", "display_long_description", "genre_names", "supported_platforms_i18n", "hero_image", "release_info"].filter((property) => value[property] != null).length;
      candidates.push({ value, score });
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  return candidates.length ? candidates.sort((a, b) => a.score - b.score).reduce((combined, candidate) => merge(combined, candidate.value), {}) : null;
}
function parseDetail(html, product) {
  const app = ldApp(html);
  const relay = relayApp(html, product.meta_id);
  if (!app && !relay) return { ...product, parse_status: "missing_meta_data" };
  const aggregate = app?.aggregateRating || {};
  const offer = first(app?.offers) || {};
  const storeOffer = relay?.current_offer || {};
  const author = first(app?.author);
  const publisher = first(app?.publisher);
  const devices = Array.isArray(app?.availableOnDevice) ? app.availableOnDevice : Array.isArray(relay?.supported_platforms_i18n) ? relay.supported_platforms_i18n : [];
  const price = app && offer.price != null ? Number(offer.price) : money(storeOffer.price);
  const availability = offer.availability || null;
  const releaseDate = normalizedDate(app?.datePublished || app?.releaseDate || relay?.release_info?.display_date);
  return {
    ...product,
    name: app?.name || relay?.display_name || product.name,
    description: app?.description || relay?.display_long_description || relay?.display_machine_translated_long_description || null,
    rating: Number(aggregate.ratingValue || relay?.quality_rating_i18n_score_string) || null,
    review_count: Number(aggregate.ratingCount || relay?.quality_rating_count || relay?.quality_rating_i18n_count_string) || null,
    genre: first(app?.applicationSubCategory || app?.applicationCategory || relay?.genre_names) || null,
    supported_devices: devices,
    thumbnail_url: imageUrl(app?.image || app?.thumbnailUrl) || relay?.hero_image?.uri || relay?.cover_square_image?.uri || null,
    price: Number.isFinite(price) ? price : null,
    original_price: money(storeOffer.strikethrough_price),
    currency: offer.priceCurrency || storeOffer?.price?.currency || null,
    availability,
    release_date: releaseDate,
    developer: typeof author === "string" ? author : author?.name || relay?.developer_name || null,
    publisher: typeof publisher === "string" ? publisher : publisher?.name || relay?.publisher_name || null,
    parse_status: "parsed",
  };
}
function supportsDevice(devices, target) {
  return devices.some((device) => {
    const value = String(device).toLowerCase().replace(/\s+/g, " ");
    if (target === "quest 3") return value.includes("quest 3") && !value.includes("quest 3s");
    return value.includes(target);
  });
}
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function restAll(path, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const page = await rest(path, { headers: { Range: `${start}-${start + pageSize - 1}` } });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) return rows;
  }
}

async function collectCards(page) {
  await page.goto(SOURCE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const merged = new Map();
  let stable = 0;
  let previous = 0;
  for (let round = 0; round < 120 && merged.size < MAX_PRODUCTS; round += 1) {
    const cards = await page.locator('main a[href*="/experiences/"]').evaluateAll((anchors, badgeLabels) => anchors.map((anchor) => {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const match = href.match(/\/experiences\/(?!section\/|view\/|meta-horizon-plus\/)([^/?#]+)\/(\d{6,})\/?/);
      if (!match) return null;
      const lines = (anchor.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      const badges = new Set(badgeLabels);
      const categoryLine = lines.find((line) => /(?:^|•)\s*(?:Games?|게임)(?:\s*•|$)/i.test(line));
      const kind = categoryLine ? "game" : "other";
      const status = lines.some((line) => /Coming Soon|준비 중/i.test(line)) ? "coming_soon" : lines.some((line) => /Pre-Order|예약 주문/i.test(line)) ? "preorder" : "released";
      const name = lines.find((line) => !badges.has(line) && line !== categoryLine && !/Coming Soon|준비 중|Pre-Order|예약 주문/i.test(line)) || match[1].replaceAll("-", " ");
      return { meta_id: match[2], slug: match[1], name, kind, listing_status: status, meta_store_url: `https://www.meta.com/en-us/experiences/${match[1]}/${match[2]}/` };
    }).filter(Boolean), CARD_BADGES);
    for (const card of cards) if (!merged.has(card.meta_id)) merged.set(card.meta_id, card);
    stable = merged.size === previous ? stable + 1 : 0;
    previous = merged.size;
    const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 8);
    if (stable >= STABLE_ROUNDS && atBottom) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await page.waitForTimeout(900);
  }
  return [...merged.values()].slice(0, MAX_PRODUCTS);
}

await mkdir(reportDir, { recursive: true });
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch (error) {
  if (process.platform !== "win32" || !/Executable doesn't exist/i.test(error.message)) throw error;
  browser = await chromium.launch({ channel: "msedge", headless: true });
}
const candidates = [];
let listed = [];
try {
  const context = await browser.newContext({ locale: "en-US", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
  const listPage = await context.newPage();
  listed = await collectCards(listPage);
  const detailPage = await context.newPage();
  let olderReleasedStreak = 0;
  for (const product of listed) {
    if (product.kind !== "game" || /(?:^|[-\s])demo(?:$|[-\s])/i.test(`${product.slug} ${product.name}`)) continue;
    await detailPage.goto(product.meta_store_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await detailPage.waitForTimeout(500);
    const parsed = parseDetail(await detailPage.content(), product);
    const released = product.listing_status === "released" && !/PreOrder/i.test(parsed.availability || "");
    const releaseTime = parsed.release_date ? Date.parse(`${parsed.release_date}T00:00:00Z`) : NaN;
    const older = released && Number.isFinite(releaseTime) && releaseTime < cutoff.getTime();
    olderReleasedStreak = older ? olderReleasedStreak + 1 : 0;
    if (product.listing_status !== "released" || !Number.isFinite(releaseTime) || releaseTime >= cutoff.getTime()) candidates.push(parsed);
    if (olderReleasedStreak >= 5) break;
    await sleep(DETAIL_DELAY_MS + Math.floor(Math.random() * 500));
  }
  await context.close();
} finally {
  await browser.close();
}

const existing = await restAll("games?select=id,name,slug,meta_product_id,meta_catalog_item_id,release_date,krw_price,krw_store_available,source_status,active&order=id.asc");
const existingByMetaId = new Map(existing.flatMap((game) => [game.meta_product_id, game.meta_catalog_item_id].filter(Boolean).map((id) => [String(id), game])));
const usedSlugs = new Set(existing.map((game) => game.slug));
const newRows = [];
const genreByMetaId = new Map();
const existingUpdates = [];
const skipped = [];
for (const game of candidates) {
  if (game.parse_status !== "parsed" || !game.meta_id || !game.name || !game.thumbnail_url) {
    skipped.push({ meta_id: game.meta_id, name: game.name, reason: game.parse_status !== "parsed" ? game.parse_status : "missing_required_metadata" });
    continue;
  }
  if (game.genre) genreByMetaId.set(String(game.meta_id), GENRE_NAMES[game.genre] || game.genre);
  const found = existingByMetaId.get(String(game.meta_id));
  if (found) {
    const payload = {};
    if (!found.release_date && game.release_date) payload.release_date = game.release_date;
    if (String(found.source_status || "").startsWith("official_meta_recent_overseas:")) {
      payload.source_status = `official_meta_recent_overseas:${game.listing_status}`;
      payload.active = game.listing_status === "released";
    }
    if (Object.keys(payload).length) existingUpdates.push({ id: found.id, name: found.name, payload });
    continue;
  }
  let slug = normalizedSlug(game.slug || game.name) || `meta-${game.meta_id}`;
  if (usedSlugs.has(slug)) slug = `${slug}-${game.meta_id}`;
  usedSlugs.add(slug);
  const price = game.price == null ? null : Number(game.price);
  const free = price === 0;
  newRows.push({
    meta_product_id: String(game.meta_id), meta_catalog_id: null, meta_catalog_item_id: String(game.meta_id),
    name: game.name.trim(), slug, affiliate_url: null, meta_store_url: game.meta_store_url,
    image_path: null, source_image_url: game.thumbnail_url, current_price: price, original_price: game.original_price,
    currency: game.currency || "USD", usd_price: game.currency === "USD" ? price : null, krw_price: null,
    description: game.description, developer: game.developer, publisher: game.publisher, release_date: game.release_date,
    rating: game.rating, review_count: game.review_count, supports_korean: null,
    supports_quest_2: supportsDevice(game.supported_devices || [], "quest 2"),
    supports_quest_3: supportsDevice(game.supported_devices || [], "quest 3"),
    supports_quest_3s: supportsDevice(game.supported_devices || [], "quest 3s"),
    source_status: `official_meta_recent_overseas:${game.listing_status}`, active: game.listing_status === "released",
    pricing_type: free ? "free" : "paid", affiliate_discount_active: false, region_restricted: false,
  });
}

const report = {
  generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", source_url: SOURCE_URL,
  cutoff_date: cutoff.toISOString().slice(0, 10), listed: listed.length, eligible: candidates.length,
  upcoming: candidates.filter((game) => game.listing_status !== "released").length,
  recent_released: candidates.filter((game) => game.listing_status === "released").length,
  new_games: newRows.length, existing_updates: existingUpdates.length, skipped,
  inserted: 0, updated: 0, genre_links: 0, status: "ready", preview: newRows,
};
await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (apply) {
  let inserted = [];
  if (newRows.length) {
    inserted = await rest("games?on_conflict=meta_product_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(newRows) });
    report.inserted = inserted?.length || 0;
  }
  for (const update of existingUpdates) {
    const updated = await rest(`games?id=eq.${update.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...update.payload, updated_at: new Date().toISOString() }) });
    report.updated += updated?.length || 0;
  }
  const allTargetGames = new Map(existing.map((game) => [String(game.meta_product_id || game.meta_catalog_item_id), game]));
  for (const game of inserted) allTargetGames.set(String(game.meta_product_id), game);
  const genreTargets = candidates.map((game) => ({ game: allTargetGames.get(String(game.meta_id)), genre: genreByMetaId.get(String(game.meta_id)) })).filter((target) => target.game?.id && target.genre);
  const genreNames = [...new Set(genreTargets.map((target) => target.genre))];
  if (genreNames.length) {
    const genres = genreNames.map((name) => ({ name, slug: GENRE_SLUGS[name] || `meta-genre-${createHash("sha256").update(name).digest("hex").slice(0, 12)}` }));
    await rest("genres?on_conflict=name", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(genres) });
    const genreRows = await rest("genres?select=id,name&limit=1000");
    const genreIds = new Map((genreRows || []).map((genre) => [genre.name, genre.id]));
    const links = genreTargets.map((target) => ({ game_id: target.game.id, genre_id: genreIds.get(target.genre) })).filter((link) => link.genre_id);
    if (links.length) {
      const linked = await rest("game_genres?on_conflict=game_id,genre_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(links) });
      report.genre_links = linked?.length || 0;
    }
  }
  report.status = report.inserted === newRows.length && report.updated === existingUpdates.length ? "complete" : "incomplete";
  delete report.preview;
}
await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`최근 Meta 게임: 목록 ${report.listed}, 대상 ${report.eligible} (출시 예정 ${report.upcoming}, 최근 출시 ${report.recent_released}), 신규 ${report.new_games}, 기존 갱신 ${report.existing_updates}`);
if (apply) console.log(`DB 반영: 신규 ${report.inserted}/${report.new_games}, 기존 갱신 ${report.updated}/${report.existing_updates}`);
if (report.status === "incomplete") process.exitCode = 1;
