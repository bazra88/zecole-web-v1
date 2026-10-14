# Meta sale collection and price application

Collect the section once per region. GitHub Actions runs `collect-meta-sale.mjs`
with `EXPECTED_CURRENCY=USD`; the Seoul server uses `EXPECTED_CURRENCY=KRW`
and its existing Chromium with `SERVER_CHROMIUM=1`. Both save games, observation
timestamps, thumbnails, progress, and final-page evidence without writing to DB.

The collector keeps unloaded cards visible during layout shifts. A full result
requires no remaining loading placeholders, reaching the actual scroll container
bottom repeatedly, and no new cards for 30 seconds. A stall is not completion.
Cards without numeric prices remain in the raw output and must not become zero.

Classification follows the current operator rule: an existing KRW price selects
the Korean observation; an existing USD price with no KRW price selects the US
observation. Do not infer a region restriction from absence in a sale section.
Do not visit individual product pages to establish region availability.

When applying a verified snapshot, update the selected currency's price plus
`current_price`, `currency`, `original_price`, `meta_store_original_price`, and
`price_checked_at`. Keep `games` and the corresponding `price_history` insertion
in one transaction. Retrying the same `(game_id, currency, checked_at)` snapshot
must not duplicate history. Never overwrite a newer observation. Preserve all
older history, and save the before-state for recovery.

Meta store sales suppress affiliate discounts. Cards show `Meta -N%`, the
store's original price and sale price; detail purchase links use the official
store URL. At a known `meta_store_offer_ends_at` deadline, public cards and detail
pages automatically use the saved `meta_store_original_price` as the regular
price, restore the affiliate discount/link, and remove the store-sale badge and
countdown. A small browser timer also switches already-open/cached pages without
navigation, API calls, or Meta requests. KRW/USD selection remains unchanged.
Discount sorting, price sorting and price filters use the same resolved price.

This is a display fallback, not a verified price observation: it never overwrites
prices, `price_checked_at`, or price history. Details label the fallback as
`할인 종료 · 저장된 정상가 기준`. Existing visit-time collection can confirm a new
regular price or a new sale. An explicitly reconfirmed discount without a new
deadline clears an expired old deadline. Unknown/invalid deadlines do not expire
automatically. Absence from a later sale section alone is not proof of expiry.

For the manual collection workflow, supply the current section URL and, if
confirmed, `campaign_ends_at` with an explicit timezone, e.g.
`2026-11-01T16:00:00+09:00`. Seoul uses `META_SALE_ENDS_AT` for the same value.
Only use a campaign deadline for that campaign's items, not a full-catalog scan.
The collector retains `offer_ends_at` per discounted row. Preserve it in the
reviewed plan. `build-meta-sale-sql.mjs` accepts per-item `offer_ends_at` or a
plan-level `campaign_ends_at`; an explicit per-item null means unknown and takes
precedence. Known deadlines are saved in both games and price_history. A new
snapshot without a deadline clears the previous deadline rather than incorrectly
attaching an old campaign to a new sale. Past-deadline observations and timestamps
without timezones are rejected. This does not start or schedule collection.

2026-10-14 repair: the operator's September Connect sale announcement
https://gall.dcinside.com/mgallery/board/view/?id=vr_games_xuq&no=704432
specifies September 29, 16:00 KST (`2026-09-29T07:00:00Z`). The retained September
23 import plan is matched by game ID, currency, exact observation timestamp,
sale price and original price. Only unchanged rows with missing deadlines are
eligible for deadline repair; later observations and existing deadlines are not
overwritten. No historical prices or timestamps are changed.
Applied to 454 unchanged rows (452 publicly visible). After repair, 597 public
discount rows have known elapsed deadlines; 9 still have unknown deadlines and
are left unchanged, and 1 has a future deadline. Before-state saved locally as
`work/sale-expiry-before-20261014.json` outside the repository.

The workflow is manual-only. No push trigger or recurring schedule is enabled.
Only existing catalog games are updated; unmatched games remain excluded.

Verification: `node scripts/test-sale-expiry.mjs`, `node scripts/test-sale-pricing.mjs`,
`node scripts/test-discount-sort.mjs`. Browser fixture with real card/detail
components and a 12-second deadline: `node scripts/verify-sale-expiry.cjs` (port 4400,
no external data requests).
