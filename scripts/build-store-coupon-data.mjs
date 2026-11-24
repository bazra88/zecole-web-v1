// 쿠폰 행사 목록(Meta 행사 페이지 수집 결과)을 사이트 게임 ID로 연결해 lib/store-coupon-data/<이름>.js를 만든다.
// DB는 공개 조회 키로 읽기만 한다(쓰기 없음). Meta에는 접속하지 않는다.
//
// 사용법:
//   node scripts/build-store-coupon-data.mjs <설정.json> <보고서.json>
// 설정 예:
//   { "name": "bf2026", "code": "BF2026", "percent": 40, "ends_at": "2026-12-01T23:59:00+09:00",
//     "end_label": "12월 1일 종료", "source_url": "...", "krw_list": "krw.json", "usd_list": "usd/games.json" }
// 목록 형식: 수집기 games.json([{meta_id,name,current_price,original_price,currency,checked_at}])
//          또는 { rows: [[meta_id, name, price, original, currency]], collected_at }
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { displayedStorePrice, storeDiscountInfo } from "../lib/game-format.js";

const [configFile, reportFile] = process.argv.slice(2);
if (!configFile || !reportFile) throw new Error("사용법: node scripts/build-store-coupon-data.mjs <설정.json> <보고서.json>");
const configDir = path.dirname(path.resolve(configFile));
const config = JSON.parse(await readFile(configFile, "utf8"));
if (!/^[a-z0-9-]+$/.test(config.name || "")) throw new Error("name은 영소문자·숫자·-만 사용");
if (!/^[A-Z0-9]+$/.test(config.code || "")) throw new Error("code가 올바르지 않음");
if (!(config.percent > 0 && config.percent < 100)) throw new Error("percent가 올바르지 않음");
if (!/(Z|[+-]\d{2}:\d{2})$/.test(config.ends_at || "") || !Number.isFinite(Date.parse(config.ends_at))) throw new Error("ends_at에는 시간대가 있는 ISO 시각이 필요");

async function loadEnv() {
  const text = await readFile(".env.local", "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function normalizeList(raw, currency) {
  const rows = Array.isArray(raw)
    ? raw.map((r) => ({ meta_id: String(r.meta_id), name: r.name, price: r.current_price, original: r.original_price, currency: r.currency }))
    : raw.rows.map(([meta_id, name, price, original, cur]) => ({ meta_id: String(meta_id), name, price, original, currency: cur }));
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.meta_id)) throw new Error(`${currency} 목록에 중복 ID: ${row.meta_id}`);
    ids.add(row.meta_id);
    if (row.price != null && row.currency !== currency) throw new Error(`${currency} 목록에 다른 통화: ${row.meta_id} ${row.currency}`);
  }
  return new Map(rows.map((row) => [row.meta_id, row]));
}

async function loadList(file, currency) {
  if (!file) return null;
  return normalizeList(JSON.parse(await readFile(path.resolve(configDir, file), "utf8")), currency);
}

await loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error(".env.local에 공개 Supabase 주소·키가 필요");

const games = [];
for (let offset = 0; ; ) {
  const query = new URL(`${url}/rest/v1/games`);
  query.searchParams.set("select", "id,name,slug,meta_product_id,pricing_type,krw_price,usd_price,current_price,currency,meta_store_original_price,meta_store_offer_ends_at");
  query.searchParams.set("active", "eq.true");
  query.searchParams.set("admin_hidden", "eq.false");
  query.searchParams.set("order", "id.asc");
  query.searchParams.set("limit", "1000");
  query.searchParams.set("offset", String(offset));
  const response = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`DB 조회 실패 ${response.status}`);
  const batch = await response.json();
  // 서버 응답 상한이 1,000보다 작을 수 있으므로 빈 묶음이 올 때까지 읽는다.
  if (!batch.length) break;
  games.push(...batch);
  offset += batch.length;
}

const lists = { KRW: await loadList(config.krw_list, "KRW"), USD: await loadList(config.usd_list, "USD") };
const byMetaId = new Map();
const duplicateMetaIds = [];
for (const game of games) {
  const metaId = String(game.meta_product_id || "").split("_").pop();
  if (!/^\d{6,}$/.test(metaId)) continue;
  if (byMetaId.has(metaId)) duplicateMetaIds.push(metaId);
  else byMetaId.set(metaId, game);
}

const now = Date.now();
const selected = [];
const excluded = [];
for (const [metaId, game] of byMetaId) {
  if (duplicateMetaIds.includes(metaId)) continue;
  // 화면과 같은 규칙(lib/game-format.js)으로 통화와 가격을 정한다: 원화 가격(또는 원화 current_price)이
  // 있으면 원화, 없으면 달러. 지난 할인이 끝난 게임은 저장된 정상가로 본다.
  const shownPrice = displayedStorePrice(game, new Date(now));
  if (!shownPrice || !lists[shownPrice.currency]) continue;
  const currency = shownPrice.currency;
  const row = lists[currency].get(metaId);
  if (!row) continue;
  // Meta 자체 할인이 진행 중이면 정상가(저장된 원가)와 비교한다. 쿠폰 표시는 그 할인이 끝난 뒤
  // 화면에서 자동으로 시작된다(storeCouponInfo가 할인 중에는 쿠폰을 숨김).
  const activeSale = storeDiscountInfo(game, new Date(now));
  const regular = activeSale ? Number(game.meta_store_original_price) : shownPrice.amount;
  const base = { id: game.id, meta_id: metaId, name: game.name, slug: game.slug, currency, db_price: regular, active_store_sale: Boolean(activeSale), list_price: row.price, list_original: row.original };
  const free = game.pricing_type === "free" || game.pricing_type === "free_to_play";
  const listSale = row.original != null && row.price != null && row.original > row.price;
  if (free || !(row.price > 0)) excluded.push({ ...base, reason: "무료이거나 목록 가격 없음" });
  else if (listSale) excluded.push({ ...base, reason: "Meta가 가격을 직접 내림(쿠폰 중복 여부 미확인)" });
  else if (!(base.db_price > 0)) excluded.push({ ...base, reason: "DB 가격 없음" });
  // 사이트 가격이 행사 목록 가격과 다르면 쿠폰가가 틀리게 계산되므로 넣지 않는다(가격은 따로 갱신할 것).
  else if (Math.abs(base.db_price - row.price) > (currency === "KRW" ? 0.5 : 0.005)) excluded.push({ ...base, reason: "사이트 가격이 행사 목록 가격과 다름" });
  else selected.push(base);
}

const matchedMetaIds = new Set([...selected, ...excluded].map((r) => r.meta_id));
const unmatched = {};
for (const currency of ["KRW", "USD"]) {
  if (!lists[currency]) continue;
  unmatched[currency] = [...lists[currency].values()].filter((row) => !matchedMetaIds.has(row.meta_id)).length;
}

// 통화별로 남긴다. 나중에 게임의 표시 통화가 바뀌면(예: 한국 가격이 새로 생김) 그 지역 행사 목록에서
// 확인한 것이 아니므로 화면이 쿠폰을 표시하지 않는다(storeCouponInfo의 통화 확인).
const gameIdsByCurrency = { KRW: [], USD: [] };
for (const r of selected) gameIdsByCurrency[r.currency].push(r.id);
for (const ids of Object.values(gameIdsByCurrency)) ids.sort();
const gameIds = selected.map((r) => r.id);
const data = {
  name: config.name,
  code: config.code,
  percent: config.percent,
  starts_at: config.starts_at || null,
  ends_at: config.ends_at,
  end_label: config.end_label || null,
  source_url: config.source_url || null,
  built_at: new Date().toISOString(),
  game_ids_by_currency: gameIdsByCurrency,
};
const outDir = path.join("lib", "store-coupon-data");
await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, `${config.name}.js`),
  `// 자동 생성: scripts/build-store-coupon-data.mjs (직접 고치지 말고 다시 생성)\n` +
  `// ${config.code} 코드 ${config.percent}% 쿠폰 행사 대상 사이트 게임 ID ${gameIds.length}개\n` +
  `const campaign = ${JSON.stringify(data, null, 1)};\n\nexport default campaign;\n`,
);

const summary = {
  db_games: games.length,
  db_duplicate_meta_ids: duplicateMetaIds.length,
  list_counts: Object.fromEntries(Object.entries(lists).filter(([, v]) => v).map(([k, v]) => [k, v.size])),
  selected: selected.length,
  selected_waiting_for_store_sale_end: selected.filter((r) => r.active_store_sale).length,
  selected_by_currency: selected.reduce((m, r) => ((m[r.currency] = (m[r.currency] || 0) + 1), m), {}),
  excluded: excluded.length,
  excluded_by_reason: excluded.reduce((m, r) => ((m[r.reason] = (m[r.reason] || 0) + 1), m), {}),
  list_not_in_site: unmatched,
};
await writeFile(reportFile, JSON.stringify({ summary, selected, excluded }, null, 1));
console.log(JSON.stringify(summary, null, 1));
