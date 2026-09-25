# Full Meta section automation trial — 2026-09-26 KST

Read-only trial of section `3878844519028756`, logged out, without the discount
filter. No detail-page navigation, DB writes, or recurring schedule.

GitHub run: https://github.com/bazra88/zecole-web-v1/actions/runs/36193888369
Tested commit: 0b7c38b716e3d46a7a7d972a9430c96cab9048a1

US trial reached a stable section bottom with no placeholders for 45 seconds.
It collected exactly 1,000 unique cards in 6m51s: 368 numeric USD prices,
130 discounted games, zero ambiguous prices or currency mismatches.
413 cards matched the saved 3,900-game DB inventory; 330 matched prices and
116 matched discounts. This is SECTION completion, not full-store coverage.
The exact 1,000 boundary may be a section cap; its cause is not yet verified.
Never use absent games to clear a price or sale.

Observed 82 `/ocapi/graphql` and 7 `/api/graphql/` responses, plus route,
telemetry and static asset requests. These are response counts, not a proven
count of pagination calls. No offer end times were extracted; the JSON reader
did not decode most ocapi responses, so absence of end times is inconclusive.

Seoul trial reached at least 728 cards, then exhausted available memory on the
1-vCPU/1-GB production collector server. Stop commands became unresponsive.
This trial must not be marked complete. Do not run it again on that server
without OS-enforced memory/CPU limits and an external timeout/kill mechanism.

Post-trial changes (not yet run): block image/media/font downloads while
preserving their DOM URLs, distinguish section vs catalog completion, and
refuse server mode without the explicit memory-isolation flag. That flag does
not itself create isolation: the launcher must enforce it with a cgroup.

Before daily use: recover/verify Seoul service, implement constrained launch,
verify Korean collection, establish broader catalog coverage, decode list
offer metadata, and add a separate validated DB application step. Current
workflow is manual-only on the test branch; production workflow is unchanged.
