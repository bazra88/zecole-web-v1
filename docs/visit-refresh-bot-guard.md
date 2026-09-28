# Visit-refresh bot guard

Visitor-triggered Meta fetches (`/api/games/visit`, `/api/media/trailer`) share the
`reserve_meta_fetch` budget (per region: 60s interval, 20/hour, 100/day). After the
9/23 incident (1,883 detail pages in one day, 1,389 failed refreshes), crawlers kept
consuming it: 9/24–9/27 saw 110–160 distinct games refreshed per day and the KRW
budget hit exactly 100 every day. The visited games matched the whole catalog's
long-tail distribution (median 5 reviews, 59.5% with ≤10 reviews, 3.9% with 1000+),
not the popular or on-sale games people actually open.

Three layers keep crawlers from spending the budget. Humans see no change.

1. `app/robots.js` disallows `/api/` and `/admin`. Search-engine renderers respect
   this for sub-requests, so they index detail pages without calling the refresh API.
2. `components/GameVisitRefresh.js` skips the request and the loading overlay when
   `navigator.webdriver` is true or the user agent is a bot.
3. Both routes return before reserving budget for bot or missing user agents
   (`/api/games/visit` → `{skipped:'bot'}`, `/api/media/trailer` → 403).

Detection lives only in `lib/bot-detect.mjs`; `scripts/test-bot-detect.mjs` covers
major crawlers plus Korean in-app browsers (KakaoTalk, Naver, Instagram) and the
Quest browser, which must stay human. Any new endpoint that fetches Meta on behalf
of a visitor must use the same guard before `reserve_meta_fetch`.

Stealth scrapers that spoof a normal Chrome user agent and hide automation are not
caught. To judge the effect, compare against the baseline above: distinct games per
day in `game_visit_refresh.attempted_at`, and daily rows per region in
`meta_fetch_attempts` (KRW should stop hitting 100/day). The Vercel dashboard
Firewall → Traffic view shows remaining bot traffic by name; the REST API does not
expose it.
