import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const stateDir = resolve(root, ".meta-cache", "qsdb-local");
const statePath = resolve(stateDir, "state.json");
const reportPath = resolve(stateDir, "latest-report.json");
const parseArg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const limit = Math.max(1, Number(parseArg("limit", 100)));
const dailyLimit = Math.max(1, Number(parseArg("daily-limit", 100)));
const minReviews = Math.max(1, Number(parseArg("min-reviews", 1000)));
const requestedDelay = Math.max(10_000, Number(parseArg("delay-ms", 10_000)));
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_QSDB_METADATA");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_QSDB_METADATA 확인값이 필요합니다.");

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SECRET_KEY;
if (!rawUrl || !publicKey) throw new Error("Supabase 공개 환경변수가 필요합니다.");
if (apply && !secretKey) throw new Error("실제 반영에는 로컬 SUPABASE_SECRET_KEY가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headersFor = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const today = new Date().toISOString().slice(0, 10);

await mkdir(stateDir, { recursive: true });
let state = { date: today, request_count: 0, completed_ids: [] };
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch {}
if (state.date !== today) state = { date: today, request_count: 0, completed_ids: [] };
const completedIds = new Set(state.completed_ids || []);
const remainingToday = Math.max(0, dailyLimit - Number(state.request_count || 0));
if (!remainingToday) throw new Error(`오늘의 안전 한도 ${dailyLimit}개를 이미 사용했습니다.`);

async function fetchAllCandidates() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`${supabaseUrl}/rest/v1/games`);
    url.searchParams.set("select", "id,name,slug,meta_product_id,meta_store_url,rating,review_count,krw_price,krw_store_available,release_date");
    url.searchParams.set("active", "eq.true");
    url.searchParams.set("pricing_type", "eq.paid");
    url.searchParams.set("order", "name.asc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: headersFor(publicKey) });
    if (!response.ok) throw new Error(`Supabase 후보 조회 실패: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function priority(game) {
  const rating = Number(game.rating || 0);
  const reviews = Number(game.review_count || 0);
  if (rating >= 4 && reviews >= minReviews) return 0;
  if (reviews >= minReviews) return 1;
  if (rating >= 4) return 2;
  return 3;
}

const numericMetaId = (game) => String(game.meta_product_id || game.meta_store_url?.match(/\b\d{10,}\b/)?.[0] || "").match(/\d{10,}$/)?.[0] || "";
const decodeXml = (value) => value.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
const stripTags = (value) => decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const monthNumbers = new Map([["january","01"],["february","02"],["march","03"],["april","04"],["may","05"],["june","06"],["july","07"],["august","08"],["september","09"],["october","10"],["november","11"],["december","12"]]);

function parsePage(html) {
  const releaseBlock = html.match(/release date[\s\S]{0,900}?app-details-release-year[^>]*>[\s\S]*?(\d{4})[\s\S]*?<span[^>]*class="[^"]*(?:mt-0\.5|sm:my-1)[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  let releaseDate = null;
  if (releaseBlock) {
    const dateText = stripTags(releaseBlock[2]);
    const match = dateText.match(/([A-Za-z]+)\s+(\d{1,2})/);
    const month = match ? monthNumbers.get(match[1].toLowerCase()) : null;
    if (month) releaseDate = `${releaseBlock[1]}-${month}-${match[2].padStart(2, "0")}`;
  }
  const priceBlock = html.match(/app-details-bar-price-container[\s\S]{0,3500}?app-price-amount[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  const priceText = priceBlock ? stripTags(priceBlock[1]) : "";
  const krwMatch = priceText.match(/[₩￦]\s*([\d,]+)/);
  return { krwPrice: krwMatch ? Number(krwMatch[1].replaceAll(",", "")) : null, releaseDate, priceText };
}

const robotsResponse = await fetch("https://queststoredb.com/robots.txt", { headers: { "User-Agent": "ZECOLECatalog/1.0" } });
const robots = robotsResponse.ok ? await robotsResponse.text() : "";
const crawlDelaySeconds = Number(robots.match(/Crawl-delay:\s*(\d+)/i)?.[1] || 10);
const delayMs = Math.max(requestedDelay, crawlDelaySeconds * 1000);
const sitemapResponse = await fetch("https://queststoredb.com/sitemap.xml", { headers: { "User-Agent": "ZECOLECatalog/1.0" } });
if (!sitemapResponse.ok) throw new Error(`Quest Store DB 사이트맵 조회 실패: ${sitemapResponse.status}`);
const sitemap = await sitemapResponse.text();
const urlByMetaId = new Map();
for (const match of sitemap.matchAll(/<loc>(https:\/\/queststoredb\.com\/game\/[^<]+-(\d{10,})\/)<\/loc>/g)) urlByMetaId.set(match[2], decodeXml(match[1]));

const candidates = (await fetchAllCandidates()).filter((game) => {
  const needsKrwCheck = game.krw_price == null && game.krw_store_available !== false;
  return (needsKrwCheck || !game.release_date) && !completedIds.has(game.id) && numericMetaId(game) && urlByMetaId.has(numericMetaId(game));
}).sort((a, b) => {
  const tier = priority(a) - priority(b);
  if (tier) return tier;
  const reviews = Number(b.review_count || 0) - Number(a.review_count || 0);
  if (reviews) return reviews;
  return Number(b.rating || 0) - Number(a.rating || 0);
});
const selected = candidates.slice(0, Math.min(limit, remainingToday));
const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", delay_ms: delayMs, daily_limit: dailyLimit, selected: selected.length, succeeded: 0, updated: 0, stopped_reason: null, rows: [] };
let consecutiveFailures = 0;
let consecutiveNonKrw = 0;

for (let index = 0; index < selected.length; index += 1) {
  const game = selected[index];
  if (index > 0) await sleep(delayMs + Math.floor(Math.random() * 2000));
  const metaId = numericMetaId(game);
  const qsdbUrl = urlByMetaId.get(metaId);
  let result;
  try {
    const response = await fetch(qsdbUrl, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: { Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7", "User-Agent": "ZECOLECatalog/1.0" } });
    if ([403, 429].includes(response.status)) {
      report.stopped_reason = `Quest Store DB가 HTTP ${response.status}를 반환해 즉시 중단했습니다.`;
      break;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parsePage(await response.text());
    const payload = {};
    if (game.krw_price == null && parsed.krwPrice != null) {
      payload.krw_price = parsed.krwPrice;
      payload.krw_store_available = true;
      payload.region_restricted = false;
      payload.price_checked_at = new Date().toISOString();
    } else if (game.krw_price == null && game.krw_store_available !== false && parsed.krwPrice == null) {
      payload.krw_store_available = false;
      payload.region_restricted = true;
      payload.price_checked_at = new Date().toISOString();
    }
    if (!game.release_date && parsed.releaseDate) payload.release_date = parsed.releaseDate;
    if (parsed.krwPrice == null) consecutiveNonKrw += 1; else consecutiveNonKrw = 0;
    if (!Object.keys(payload).length) throw new Error(`필요한 KRW/출시일을 찾지 못했습니다 (${parsed.priceText || "가격 없음"})`);
    if (apply) {
      const patchUrl = new URL(`${supabaseUrl}/rest/v1/games`);
      patchUrl.searchParams.set("id", `eq.${game.id}`);
      const patchResponse = await fetch(patchUrl, { method: "PATCH", headers: { ...headersFor(secretKey), Prefer: "return=representation" }, body: JSON.stringify(payload) });
      const body = patchResponse.ok ? await patchResponse.json() : await patchResponse.text();
      if (!patchResponse.ok || !Array.isArray(body) || body.length !== 1) throw new Error(`Supabase 반영 실패: ${patchResponse.status}`);
      report.updated += 1;
    }
    result = { id: game.id, name: game.name, meta_id: metaId, priority: priority(game), review_count: game.review_count, rating: game.rating, qsdb_url: qsdbUrl, ...parsed, payload, status: apply ? "updated" : "ready" };
    report.succeeded += 1;
    consecutiveFailures = 0;
  } catch (error) {
    result = { id: game.id, name: game.name, meta_id: metaId, qsdb_url: qsdbUrl, status: "failed", error: error.message };
    consecutiveFailures += 1;
  }
  state.request_count = Number(state.request_count || 0) + 1;
  if (apply && result.status === "updated") completedIds.add(game.id);
  state.completed_ids = [...completedIds];
  report.rows.push(result);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[${report.rows.length}/${selected.length}] ${game.name}: ${result.status}${result.krwPrice ? ` / ₩${result.krwPrice.toLocaleString("ko-KR")}` : ""}${result.releaseDate ? ` / ${result.releaseDate}` : ""}`);
  if (consecutiveNonKrw >= 10) { report.stopped_reason = "KRW가 10회 연속 감지되지 않아 지역 설정 보호를 위해 중단했습니다."; break; }
  if (consecutiveFailures >= 3) { report.stopped_reason = "3회 연속 실패해 사이트와 IP 보호를 위해 중단했습니다."; break; }
}
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Quest Store DB 보완 완료: 준비/성공 ${report.succeeded}, DB 반영 ${report.updated}, 요청 간격 ${Math.round(delayMs / 1000)}초`);
if (report.stopped_reason) console.log(`중단 사유: ${report.stopped_reason}`);
