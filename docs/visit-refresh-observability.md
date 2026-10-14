# Visit refresh decisions

`claim_game_visit_refresh_observed` wraps the existing claim without changing
quotas, cooldowns, bot filtering or the Meta request path. It holds the same
regional row lock while the claim runs and its result is classified. No Meta
requests are added for measurement. The event insert is fail-open.

The browser generates an in-memory random UUID per `runVisitRefresh` call. The
three possible POSTs use the same ID and attempt 0/1/2; `(visit_id, game_id,
attempt)` deduplicates request replays. A visit is a page flow, **not a person**.
GET status polling never writes telemetry. Older clients without an ID and the
trailer fallback retain the uninstrumented claim path. Invalid and recognized
bot requests are rejected before reaching the worker.
Browsers without `crypto.randomUUID` also keep the uninstrumented path; missing
telemetry support must not prevent media refresh.

## Decisions

| Outcome / reason | Meaning |
| --- | --- |
| granted | Reserved a real fetch; `fetch_token` joins `meta_fetch_attempts` for its eventual success |
| fresh | Daily check not due, media currently usable; not a delayed visit |
| joined / same_game_in_flight | Another visitor is already refreshing this game; shared fetch token where available |
| deferred / game_cooldown | Media still expired but the per-game retry cooldown applies |
| deferred / media_priority | Daily-only request yielded to expired-media demand |
| deferred / region_paused | Regional failure backoff or manual pause |
| deferred / region_in_flight | Another game occupies the regional fetch slot |
| deferred / min_interval | Regional start-to-start spacing |
| deferred / hourly_limit | Rolling-hour budget exhausted |
| deferred / daily_limit | Rolling-24-hour budget exhausted |
| deferred / unknown | Unexpected no-claim result; investigate if nonzero |

The reason is the first rejecting gate in claim order. Regional deferrals also
store budget usage and configured caps so simultaneous hour/day saturation is
visible even when an earlier gate rejects the request.

## Reporting and limitations

Run `scripts/report-visit-refresh.sql` through a server-authorized DB connection.
It gives separate decision counts and distinct page visits, region totals,
expired-media deferrals, quota pressure, affected games and later admissions
within the same flow. `seconds_to_admission` is only for observed retries that
eventually reserve a slot; it is not time to media display. No later grant does
**not** prove the user waited or abandoned the page. Joined requests and fetch
success do not prove browser rendering either. No historical blocked requests
can be reconstructed before this deployment.

Only the service role can read/write this RLS-protected table or execute the
wrapper. No IP, UA, cookies, account identifiers, URL payloads or credentials are
stored. Compact rows older than 30 days are removed in bounded batches of 200
on subsequent instrumented claims (indexed scan with `SKIP LOCKED`). Cleanup
does not run while the site has no visits. There is no extra recurring crawler.
The advisor's [RLS enabled without policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
is intentional here: client grants are revoked and the service role alone can
access these operational records.

## Verification

- `node scripts/test-visit-observability.mjs`
- `node scripts/test-visit-deferral.mjs`
- `node scripts/test-shared-media.mjs`
- `scripts/test-visit-observability.sql` (transactional fixtures, all rolled back)

Keep the existing 15-second spacing, regional concurrency 1, and 20/hour,
100/24-hour caps until observed quota-related deferrals justify a change.
