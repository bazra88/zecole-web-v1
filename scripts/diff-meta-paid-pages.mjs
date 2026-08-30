import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-paid");
const candidates = JSON.parse(await readFile(resolve(dataDir, "candidates.json"), "utf8"));
const parsed = JSON.parse(await readFile(resolve(dataDir, "parsed.json"), "utf8"));
const existing = new Map(candidates.games.map((game) => [game.id, game]));
const supports = (devices, needle) => (devices || []).some((device) => {
  const value = String(device).toLowerCase();
  if (needle === "quest 3") return value.includes("quest 3") && !value.includes("quest 3s");
  return value.includes(needle);
});
const rows = parsed.games.map((game) => {
  const current = existing.get(game.id) || {};
  const payload = {};
  if (game.title && game.title !== current.name) payload.name = game.title;
  if (game.description) payload.description = game.description;
  if (game.rating != null) payload.rating = game.rating;
  if (game.review_count != null) payload.review_count = game.review_count;
  payload.supports_quest_2 = supports(game.supported_devices, "quest 2");
  payload.supports_quest_3 = supports(game.supported_devices, "quest 3");
  payload.supports_quest_3s = supports(game.supported_devices, "quest 3s");
  const priceField = game.currency === "KRW" ? "krw_price" : game.currency === "USD" ? "usd_price" : null;
  const storedOfficialPrice = priceField ? current[priceField] : null;
  const priceChanged = game.price != null && priceField && Number(game.price) !== Number(storedOfficialPrice);
  return {
    id: game.id, meta_id: game.meta_id, source_name: game.source_name, parsed_name: game.title,
    status: ["parsed", "parsed_relay_json"].includes(game.parse_status) ? "review_required" : game.parse_status === "already_reviewed" ? "skipped" : "blocked",
    payload, genre: game.genre, official_price: game.price, official_currency: game.currency,
    current_price: current.current_price, current_currency: current.currency, price_field: priceField,
    stored_official_price: storedOfficialPrice, price_changed: Boolean(priceChanged),
    price_change: priceChanged ? { field: priceField, from: storedOfficialPrice == null ? null : Number(storedOfficialPrice), to: game.price, currency: game.currency } : null,
  };
});
const report = {
  generated_at: new Date().toISOString(), offset: candidates.offset, count: rows.length,
  review_required: rows.filter((row) => row.status === "review_required").length,
  blocked: rows.filter((row) => row.status === "blocked").length,
  price_changes: rows.filter((row) => row.price_changed).length,
  genres: Object.fromEntries([...new Set(rows.map((row) => row.genre).filter(Boolean))].sort().map((genre) => [genre, rows.filter((row) => row.genre === genre).length])),
  rows,
};
await writeFile(resolve(dataDir, "diff-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`유료게임 검수 리포트: ${report.review_required}/${report.count}, 가격 변경 후보 ${report.price_changes}개, 차단 ${report.blocked}개`);
