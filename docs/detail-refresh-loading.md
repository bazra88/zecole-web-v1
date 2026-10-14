# Detail refresh loading

The route `loading.js` only covers the initial server-rendered page. It ends
before the browser's visit refresh request, so it cannot indicate that a saved
sale price is still being checked.

`GameVisitRefresh` now continues the same overlay through the checking and retry
waiting states and through the React transition that applies `router.refresh()`.
The terminal status update is inside that transition. The overlay disappears
when the refreshed server content commits, not when the visit API replies.
Completion notifications also wait until that commit. Detail content is inert
while busy to prevent purchasing from stale pricing underneath the overlay.

Fresh/unchanged data exits immediately. A deferred, failed or unavailable-price
result exits with its existing warning; there is no artificial minimum delay.
Network timeouts, cancellation, retry limits, regional quotas and bot protection
are unchanged. No additional Meta requests are introduced.

## Reproducing the UI regression locally

Run `node scripts/verify-visit-loading.cjs`, then open `http://127.0.0.1:4399`.
This bundles the actual components against simulated visit and router boundaries
with real React transitions and Suspense. No credentials or external data calls
are used. The fixture is a local server, not a production route.

1. Initial checking: overlay visible, stored-price content inert.
2. Click `API 완료 · 화면 대기`: the visit response resolves, but the new price
   render is suspended. The overlay must remain, now showing the applying state.
3. Click `화면 반영 완료`: the new price appears and the overlay disappears in
   the same commit; the purchase button becomes available.
4. Restart and choose `순서 대기`: retain the waiting overlay.
5. Choose `한도 초과`: show the stored price with the deferral warning.
6. Restart and test `갱신 실패`, `가격 확인 불가`, and `변경 없음`: all must exit
   loading without claiming unavailable data is current.

The fixture controls do not ship in the website. Existing visit-flow tests cover
bounded retries, polling, cancellation, failure responses and telemetry IDs.
