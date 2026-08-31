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
const MINIMUMS = { monthly_games: 2, horizon_catalog: 35, indie_catalog: 50 };
const TITLE_ALIASES = new Map(Object.entries({
  "더 라이트 브리게이드": "The Light Brigade",
  "데메오: 던전 크롤러 VR": "Demeo",
  "스페이셜 옵스": "Spatial Ops",
  "신스라이더(Synth Riders)": "Synth Riders",
  "프리미엄 볼링": "Premium Bowling",
  "Tiny Archers (타이니 아처스)": "Tiny Archers",
  "레트로폴리스 2: 결코 작별하지 마세요": "Retropolis 2: Never Say Goodbye",
  "레트로폴리스의 비밀": "The Secret of Retropolis",
  "오디오 트립": "Audio Trip",
}).map(([source, target]) => [normalizeName(source), normalizeName(target)]));

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
  const pattern = /\/experiences\/(?!section\/|view\/|meta-horizon-plus\/)([^/"?#]+)\/(\d{6,})\/?/g;
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
  for (let round = 0; round < 100; round += 1) {
    await page.evaluate(() => {
      const bottom = Math.max(0, document.body.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(bottom, window.scrollY + window.innerHeight * 0.75));
    });
    await page.waitForTimeout(1200);
    const count = await page.locator('a[href*="/experiences/"]').count();
    const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 8);
    stableRounds = atBottom && count === previousCount ? stableRounds + 1 : 0;
    previousCount = count;
    if (stableRounds >= 10) break;
  }
  const products = await page.locator('a[href*="/experiences/"]').evaluateAll((anchors) => {
    const seen = new Set();
    const rows = [];
    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const match = href.match(/\/experiences\/(?!section\/|view\/|meta-horizon-plus\/)([^/?#]+)\/(\d{6,})\/?/);
      if (!match || seen.has(match[2])) continue;
      const text = (anchor.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      const name = text[0] || match[1].replaceAll("-", " ");
      if (["홈", "게임", "앱", "Home", "Games", "Apps", "우수 판매자", "높은 평점"].includes(name)) continue;
      seen.add(match[2]);
      rows.push({ meta_id: match[2], slug: match[1], name });
    }
    return rows;
  });
  return category === "monthly_games" ? products.slice(0, 2) : products;
}

async function collectSource(page, category, url, minimum) {
  const merged = new Map();
  const attemptCounts = [];
  const maxAttempts = category === "monthly_games" ? 2 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const products = await fetchSource(page, category, url);
    attemptCounts.push(products.length);
    for (const product of products) merged.set(product.meta_id, product);
    if (merged.size >= minimum) break;
    await page.waitForTimeout(2000);
  }
  return { rows: [...merged.values()], attemptCounts };
}
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

async function restAll(path, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const page = await rest(path, { headers: { Range: `${start}-${start + pageSize - 1}` } });
    rows.push(...(page || []));
    if (!page || page.length < pageSize) return rows;
  }
}

await mkdir(reportDir, { recursive: true });
const month = pacificMonth();
const collected = {};
const collectionAttempts = {};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "ko-KR", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
  const page = await context.newPage();
  for (const [category, url] of Object.entries(SOURCES)) {
    const result = await collectSource(page, category, url, MINIMUMS[category]);
    collected[category] = result.rows;
    collectionAttempts[category] = result.attemptCounts;
  }
  await context.close();
} finally {
  await browser.close();
}
const counts = Object.fromEntries(Object.entries(collected).map(([category, rows]) => [category, rows.length]));
const previousCurrent = await rest(`horizon_plus_entries?select=id,month,category,game_id,external_game_name,note&month=eq.${month}&limit=1000`);
const historical = previousCurrent.length ? [] : await rest(`horizon_plus_entries?select=month,category&month=lt.${month}&order=month.desc&limit=1000`);
const baselineMonth = previousCurrent.length ? month : historical?.[0]?.month;
const baselineRows = previousCurrent.length ? previousCurrent : (historical || []).filter((row) => row.month === baselineMonth);
const baselineCounts = Object.fromEntries(Object.keys(SOURCES).map((category) => [category, baselineRows.filter((row) => row.category === category).length]));
const minimumFailures = Object.entries(MINIMUMS).filter(([category, minimum]) => counts[category] < minimum).map(([category, minimum]) => ({ category, reason: "minimum", expected: minimum, actual: counts[category] }));
const suddenDrops = Object.keys(SOURCES).filter((category) => baselineCounts[category] && counts[category] < baselineCounts[category] - Math.max(3, Math.ceil(baselineCounts[category] * 0.15))).map((category) => ({ category, reason: "sudden_drop", expected: baselineCounts[category], actual: counts[category] }));
const invalid = [...minimumFailures, ...suddenDrops];
const report = { generated_at: new Date().toISOString(), month, mode: apply ? "apply" : "dry_run", sources: SOURCES, minimums: MINIMUMS, counts, collection_attempts: collectionAttempts, baseline_month: baselineMonth || null, baseline_counts: baselineCounts, status: invalid.length ? "invalid_source" : "ready", invalid, matched: 0, unmatched: [], inserted: 0 };
if (invalid.length) {
  await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  throw new Error(`불완전한 Meta 응답: ${invalid.map((item) => `${item.category}=${item.actual} (${item.reason})`).join(", ")}`);
}

const games = await restAll("games?select=id,name,slug,meta_product_id,meta_store_url&order=id.asc");
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
    const normalized = normalizeName(product.name);
    const game = byMetaId.get(product.meta_id) || byName.get(normalized) || byName.get(TITLE_ALIASES.get(normalized));
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

const allIds = await rest("horizon_plus_entries?select=id&order=id.desc&limit=1");
const startId = Number(allIds?.[0]?.id || 0) + 1;
const payload = snapshot.map((row, index) => ({ id: startId + index, ...row }));
try {
  await rest(`horizon_plus_entries?month=eq.${month}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const inserted = await rest("horizon_plus_entries", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  report.inserted = inserted?.length || 0;
  if (report.inserted !== payload.length) throw new Error(`삽입 행 수 불일치: ${report.inserted}/${payload.length}`);
} catch (error) {
  if (previousCurrent?.length) {
    await rest(`horizon_plus_entries?month=eq.${month}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    await rest("horizon_plus_entries", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(previousCurrent) }).catch(() => {});
  }
  throw error;
}
const verified = await rest(`horizon_plus_entries?select=id,category&month=eq.${month}&limit=1000`);
report.verified = verified?.length || 0;
report.status = report.verified === payload.length ? "complete" : "verification_failed";
delete report.preview;
await writeFile(resolve(reportDir, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Horizon+ 동기화 완료: ${report.verified}개 (월간 ${counts.monthly_games}, 일반 ${counts.horizon_catalog}, 인디 ${counts.indie_catalog})`);
if (report.status !== "complete") process.exitCode = 1;
