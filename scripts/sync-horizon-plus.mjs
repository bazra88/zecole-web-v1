import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const reportDir = resolve(root, "data", "horizon-plus");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_HORIZON_PLUS");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_HORIZON_PLUS가 필요합니다.");

const SOURCES = {
  monthly_games: "https://www.meta.com/ko-kr/experiences/meta-horizon-plus/",
  horizon_catalog: "https://www.meta.com/ko-kr/experiences/section/746836817401205/",
  indie_catalog: "https://www.meta.com/ko-kr/experiences/section/3170833353093973/",
};
// The indie catalog is currently smaller than the main catalog; keep a guard
// against truncated responses without rejecting the legitimate ~25-30 item list.
const MINIMUMS = { monthly_games: 2, horizon_catalog: 35, indie_catalog: 20 };

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SECRET_KEY;
const key = apply ? secretKey : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

function pacificMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-01`;
}
function normalizeName(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}
function slugName(slug) {
  return decodeURIComponent(slug || "").split("-").filter(Boolean).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}
function productNames(html) {
  const names = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      const id = String(value.id || value.app_id || value.appId || "");
      const name = value.display_name || value.displayName || value.name || value.title;
      if (/^\d{6,}$/.test(id) && typeof name === "string" && name.trim()) names.set(id, name.trim());
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  return names;
}
function productsFromHtml(html) {
  const normalized = html.replaceAll("\\/", "/").replaceAll("\\u002F", "/").replaceAll("&quot;", '"');
  const names = productNames(normalized);
  const products = [];
  const seen = new Set();
  const pattern = /\/experiences\/(?!section\/|meta-horizon-plus\/)([^/"?#]+)\/(\d{6,})\/?/g;
  for (const match of normalized.matchAll(pattern)) {
    const [, slug, metaId] = match;
    if (seen.has(metaId)) continue;
    seen.add(metaId);
    products.push({ meta_id: metaId, name: names.get(metaId) || slugName(slug), slug });
  }
  return products;
}
async function fetchSource(page, category, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  let previousCount = 0;
  let stableRounds = 0;
  // Meta lazy-loads cards through viewport intersection observers. Walking in
  // viewport increments is required; jumping straight to the bottom can skip them.
  for (let round = 0; round < 80 && stableRounds < 8; round += 1) {
    await page.evaluate((step) => {
      const y = Math.min(document.body.scrollHeight - window.innerHeight, step * window.innerHeight * 0.75);
      window.scrollTo(0, Math.max(0, y));
    }, round);
    await page.waitForTimeout(1200);
    const count = await page.locator('a[href*="/experiences/"]').count();
    stableRounds = count === previousCount ? stableRounds + 1 : 0;
    previousCount = count;
  }
  const products = await page.locator('a[href*="/experiences/"]').evaluateAll((anchors) => {
    const seen = new Set();
    const rows = [];
    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const match = href.match(/\/experiences\/(?!section\/|meta-horizon-plus\/)([^/?#]+)\/(\d{6,})\/?/);
      if (!match || seen.has(match[2])) continue;
      seen.add(match[2]);
      const text = (anchor.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      rows.push({ meta_id: match[2], slug: match[1], name: text[0] || match[1].replaceAll("-", " ") });
    }
    return rows;
  });
  return category === "monthly_games" ? products.slice(0, 2) : products;
}
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

await mkdir(reportDir, { recursive: true });
const month = pacificMonth();
const collected = {};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "ko-KR", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
  const page = await context.newPage();
  for (const [category, url] of Object.entries(SOURCES)) collected[category] = await fetchSource(page, category, url);
  await context.close();
} finally {
  await browser.close();
}
const counts = Object.fromEntries(Object.entries(collected).map(([category, rows]) => [category, rows.length]));
const invalid = Object.entries(MINIMUMS).filter(([category, minimum]) => counts[category] < minimum);
const report = { generated_at: new Date().toISOString(), month, mode: apply ? "apply" : "dry_run", sources: SOURCES, minimums: MINIMUMS, counts, status: invalid.length ? "invalid_source" : "ready", invalid, matched: 0, unmatched: [], inserted: 0 };
if (invalid.length) {
  await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  throw new Error(`불완전한 Meta 응답: ${invalid.map(([category]) => `${category}=${counts[category]}`).join(", ")}`);
}

const games = await rest("games?select=id,name,slug,meta_product_id,meta_store_url&limit=10000");
const byMetaId = new Map();
const byName = new Map();
for (const game of games || []) {
  const ids = [game.meta_product_id, ...(String(game.meta_store_url || "").match(/\d{6,}/g) || [])].filter(Boolean).map(String);
  ids.forEach((id) => byMetaId.set(id, game));
  byName.set(normalizeName(game.name), game);
}
const snapshot = [];
for (const [category, products] of Object.entries(collected)) {
  for (const product of products) {
    const game = byMetaId.get(product.meta_id) || byName.get(normalizeName(product.name));
    if (game) report.matched += 1;
    else report.unmatched.push({ category, ...product });
    snapshot.push({ month, category, game_id: game?.id || null, external_game_name: game ? null : product.name, note: `Meta 공식 Horizon+ 자동 수집 · ${product.meta_id}` });
  }
}
report.preview = snapshot;
if (!apply) {
  await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Horizon+ 미리보기: 월간 ${counts.monthly_games}, 일반 ${counts.horizon_catalog}, 인디 ${counts.indie_catalog}, DB 일치 ${report.matched}/${snapshot.length}`);
  process.exit(0);
}

const previousCurrent = await rest(`horizon_plus_entries?select=id,month,category,game_id,external_game_name,note&month=eq.${month}&limit=1000`);
const allIds = await rest("horizon_plus_entries?select=id&order=id.desc&limit=1");
const startId = Number(allIds?.[0]?.id || 0) + 1;
const payload = snapshot.map((row, index) => ({ id: startId + index, ...row }));
try {
  await rest(`horizon_plus_entries?month=eq.${month}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const inserted = await rest("horizon_plus_entries", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  report.inserted = inserted?.length || 0;
  if (report.inserted !== payload.length) throw new Error(`삽입 행 수 불일치: ${report.inserted}/${payload.length}`);
} catch (error) {
  if (previousCurrent?.length) await rest("horizon_plus_entries", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(previousCurrent) }).catch(() => {});
  throw error;
}
const verified = await rest(`horizon_plus_entries?select=id,category&month=eq.${month}&limit=1000`);
report.verified = verified?.length || 0;
report.status = report.verified === payload.length ? "complete" : "verification_failed";
delete report.preview;
await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Horizon+ 동기화 완료: ${report.verified}개 (월간 ${counts.monthly_games}, 일반 ${counts.horizon_catalog}, 인디 ${counts.indie_catalog})`);
if (report.status !== "complete") process.exitCode = 1;
