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
store URL. Normal affiliate pricing resumes when a subsequent verified price
observation clears the store-sale original price. A missing game in a later sale
section does not prove its sale ended: do not restore a guessed regular price.

The workflow is manual-only. No push trigger or recurring schedule is enabled.
Only existing catalog games are updated; unmatched games remain excluded.
