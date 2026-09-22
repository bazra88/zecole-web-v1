// Offline only. Produces one atomic, retry-safe games + price_history statement.
// Input: reviewed { updates: [{ id, currency, current_price, original_price, checked_at }] }.
import { readFile, writeFile } from 'node:fs/promises';
const [inputFile, outputFile] = process.argv.slice(2);
if (!inputFile || !outputFile) throw new Error('Usage: node scripts/build-meta-sale-sql.mjs reviewed-plan.json output.sql');
const { updates } = JSON.parse(await readFile(inputFile, 'utf8'));
const ids = new Set();
const records = updates.map(r => {
  if (!/^[0-9a-f-]{36}$/.test(r.id) || ids.has(r.id)) throw new Error('Invalid/duplicate game id');
  ids.add(r.id);
  if (!['USD', 'KRW'].includes(r.currency) || typeof r.current_price !== 'number' || !Number.isFinite(r.current_price) || r.current_price < 0) throw new Error('Invalid price/currency');
  if (r.original_price != null && (!Number.isFinite(r.original_price) || r.original_price < r.current_price)) throw new Error('Invalid original price');
  if (!Number.isFinite(Date.parse(r.checked_at))) throw new Error('Invalid observation timestamp');
  return { id: r.id, currency: r.currency, current_price: r.current_price, original_price: r.original_price, checked_at: r.checked_at };
});
if (!records.length) throw new Error('Empty plan');
const json = JSON.stringify(records);
const sql = `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(28128149733502312)),
input AS MATERIALIZED (
  SELECT r.* FROM lock CROSS JOIN jsonb_to_recordset($sale_input$${json}$sale_input$::jsonb)
  AS r(id uuid, currency text, current_price numeric, original_price numeric, checked_at timestamptz)
), updated AS (
  UPDATE public.games g SET
    current_price = i.current_price, original_price = i.original_price, currency = i.currency,
    krw_price = CASE WHEN i.currency = 'KRW' THEN i.current_price ELSE g.krw_price END,
    usd_price = CASE WHEN i.currency = 'USD' THEN i.current_price ELSE g.usd_price END,
    krw_converted_price = CASE WHEN i.currency = 'USD' AND g.fx_rate_usd_krw > 0 THEN round(i.current_price * g.fx_rate_usd_krw) ELSE g.krw_converted_price END,
    region_restricted = (i.currency = 'USD'), krw_store_available = (i.currency = 'KRW'),
    meta_store_original_price = CASE WHEN i.original_price > i.current_price THEN i.original_price ELSE NULL END,
    meta_store_offer_ends_at = NULL, meta_store_show_timer = false,
    pricing_type = CASE WHEN i.current_price > 0 THEN 'paid' ELSE g.pricing_type END,
    price_checked_at = i.checked_at, updated_at = now()
  FROM input i WHERE g.id = i.id
    AND (g.price_checked_at IS NULL OR g.price_checked_at < i.checked_at)
    AND ((i.currency = 'KRW' AND g.krw_price IS NOT NULL) OR
         (i.currency = 'USD' AND g.krw_price IS NULL AND g.usd_price IS NOT NULL))
  RETURNING g.id, g.currency, g.current_price, g.original_price, g.price_checked_at
), history AS (
  INSERT INTO public.price_history(game_id, current_price, original_price, currency, discount_percent, checked_at)
  SELECT u.id, u.current_price, u.original_price, u.currency,
    CASE WHEN u.original_price > u.current_price THEN round((1-u.current_price/u.original_price)*100,1) ELSE NULL END,
    u.price_checked_at FROM updated u
  WHERE NOT EXISTS (SELECT 1 FROM public.price_history h WHERE h.game_id=u.id AND h.currency=u.currency AND h.checked_at=u.price_checked_at)
  RETURNING game_id
)
SELECT (SELECT count(*) FROM input) AS planned,
       (SELECT count(*) FROM updated WHERE currency='KRW') AS updated_krw,
       (SELECT count(*) FROM updated WHERE currency='USD') AS updated_usd,
       (SELECT count(*) FROM history) AS history_inserted;`;
await writeFile(outputFile, sql);
console.log(`Wrote atomic SQL for ${records.length} reviewed observations`);
