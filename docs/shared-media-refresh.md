# Shared media URL refresh

Game detail visits display stored game information immediately. The visitor's browser
loads screenshots, trailers and description media directly from their stored URLs.
Visit refresh does not download, resize, upload or store media files. Existing hosted
thumbnails and screenshots remain in place.

## When Meta is contacted

- A signed media URL's `oe` (hex seconds) or `Expires` (decimal seconds) expires within
  five minutes, or the existing once-daily price/rating check is due.
- URLs with no recognized expiry are used as stored. A browser media error shows a
  fallback; it does not force an unbounded server refresh.
- Both visit refresh and the trailer endpoint use `claim_game_visit_refresh`.
  The existing database lock, one-hour media retry cooldown, regional fetch budget
  and circuit breaker apply. Price/rating checks retain their daily, changed-only policy.
- The owner writes fresh signed URLs to existing `game_media` rows by media slot,
  preserving stable hosted URLs. Inline URLs are renewed in descriptions. The claim
  completes only after these writes. Missing returned media never deletes saved assets.
- Other visitors poll the shared completion state, then refresh the displayed data.
  Trailer waiters use `cacheOnly=1`. These polling endpoints never call Meta.
- A failed refresh does not loop. The page remains usable and affected media displays
  a loading or failure message. Existing valid media remains available.
- A rejected claim now distinguishes temporary regional throttling from a completed
  check. Read-only budget metadata provides a retry delay; the database claim still
  enforces all limits. A visible detail page can wait and retry at most twice (three
  total POSTs), within 150 seconds of scheduling and a 180-second overall timeout.
  Long cooldowns, provider errors, hidden tabs and navigation stop retries. Jitter
  avoids sending all waiting visitors at the same instant. No background queue or
  full-catalog refresh is introduced.
- Missing current offers preserve the last verified price and display an explicit
  warning. Media renewal can still succeed independently. `price_checked_at` retains
  the existing changed-only write policy, so an old date alone does not prove that
  no visit check occurred.

## Protection and limits

Claude's bot guard remains enabled on the client and server. Cross-site requests are
rejected. Automation does not bypass the guard to exercise live Meta requests.
Many *different* expired games can still use the regional budget; this change only
deduplicates the same game. It does not guarantee immunity from Meta IP blocking.
No database schema changes or new media storage are required.

## Verification

`node scripts/test-shared-media.mjs` exercises expiry policy, stable asset preservation,
concurrent refresh ownership, failure cooldown behavior, cached trailer reads,
read-only trailer waiters and server bot rejection using mocked I/O. It makes no
external requests. Existing bot, visit-price and sale-price regression tests also apply.
`node scripts/test-visit-deferral.mjs` covers regional limits, paused fetching,
bounded retries, hidden-tab cancellation, read-only polling and partial price failures.
