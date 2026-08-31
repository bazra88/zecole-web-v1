import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const reportDir = resolve(root, "data", "meta-recent");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_META_RECENT_KRW");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_META_RECENT_KRW가 필요합니다.");
const arg = (name, fallback) => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return value == null ? fallback : value;
};
const limit = Math.max(1, Number(arg("limit", 60)));
const delayMs = Math.max(5000, Number(arg("delay-ms", 12000)));
const maxAttempts = Math.max(1, Number(arg("attempts", 3)));
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
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}
function parseKrw(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      const offer = Array.isArray(app?.offers) ? app.offers[0] : app?.offers;
      if (!app) continue;
      return {
        found: true,
        currency: offer?.priceCurrency || null,
        price: offer?.price == null ? null : Number(offer.price),
        available: /InStock|PreOrder/i.test(offer?.availability || "") || offer?.price != null,
      };
    } catch {}
  }
  const currency = html.match(/"currency"\s*:\s*"(KRW|USD)"/i)?.[1]?.toUpperCase() || null;
  const amount = html.match(/"offset_amount"\s*:\s*(\d+)/)?.[1];
  return { found: Boolean(currency || amount), currency, price: amount ? Number(amount) / 100 : null, available: Boolean(currency || amount) };
}

await mkdir(reportDir, { recursive: true });
const candidates = await rest(`games?select=id,name,slug,meta_product_id,krw_price,krw_store_available,source_status&source_status=like.official_meta_recent_overseas:*&or=(krw_price.is.null,krw_store_available.is.null)&order=release_date.desc.nullslast,created_at.desc&limit=${limit}`);
const rows = [];
let consecutiveBlocked = 0;
for (const game of candidates || []) {
  const url = `https://www.meta.com/ko-kr/experiences/${game.slug}/${game.meta_product_id}/`;
  let result = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (rows.length || attempt > 1) await sleep(delayMs + Math.floor(Math.random() * 4000));
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLERecentKrw/1.0" } });
      const html = await response.text();
      if (response.status === 403 || response.status === 429) {
        result = { id: game.id, name: game.name, status: `http_${response.status}`, attempt };
        consecutiveBlocked += 1;
        break;
      }
      if (!response.ok) { result = { id: game.id, name: game.name, status: `http_${response.status}`, attempt }; continue; }
      const parsed = parseKrw(html);
      const krw = parsed.currency === "KRW" && Number.isFinite(parsed.price);
      result = {
        id: game.id, name: game.name, status: krw ? "krw_found" : parsed.found ? "not_krw_store" : "unresolved",
        krw_price: krw ? parsed.price : null, krw_store_available: krw ? true : parsed.found ? false : null,
        region_restricted: krw ? false : parsed.found ? true : null, attempt, final_url: response.url,
      };
      consecutiveBlocked = 0;
      break;
    } catch (error) { result = { id: game.id, name: game.name, status: "fetch_error", attempt, error: error.message }; }
  }
  rows.push(result);
  if (consecutiveBlocked >= 2) break;
}

const actionable = rows.filter((row) => ["krw_found", "not_krw_store"].includes(row.status));
let updated = 0;
if (apply) {
  for (const row of actionable) {
    const payload = { krw_price: row.krw_price, krw_store_available: row.krw_store_available, region_restricted: row.region_restricted, price_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const result = await rest(`games?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
    updated += result?.length || 0;
  }
}
const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", requested: candidates?.length || 0, checked: rows.length, actionable: actionable.length, updated, rows };
await writeFile(resolve(reportDir, "krw-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`최근 게임 KRW 확인: 대상 ${report.requested}, 확인 ${report.checked}, 반영 가능 ${report.actionable}, 실제 반영 ${report.updated}`);

