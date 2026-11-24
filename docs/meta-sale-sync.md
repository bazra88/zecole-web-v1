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

## 쿠폰 행사(결제 시 코드 입력) — 2026-11 블프 BF2026

Meta가 가격을 내리지 않고 "BF2026 코드로 40% 할인"처럼 결제 화면에서 코드를 넣어야 하는 행사는
위의 가격 반영 절차를 쓰지 않는다. 카드 가격에 취소선이 없으므로 그대로 수집·반영하면 할인이 거의
잡히지 않고, 코드 적용가를 DB 가격으로 넣으면 실제 판매가가 아닌 값이 가격 이력에 남는다.

- 표시: 서버가 `lib/store-coupons.js`로 대상 게임에 `store_coupon`을 붙이고, 화면은
  `storeCouponInfo`(lib/game-format.js)로 코드 적용가를 계산한다. DB·가격 이력은 그대로다.
- 규칙: 쿠폰 기간에는 제휴 10%를 끄고(코드는 한 결제에 하나) 구매 버튼은 공식 스토어로 연결한다.
  Meta 자체 할인 중인 게임에는 쿠폰가를 얹지 않는다. 종료 시각이 지나면 열린 화면도 원래 표시로 돌아간다.
  런처용 공개 응답(`/api/launcher/new-games`)에는 쿠폰을 넣지 않는다.
- 대상 목록: 행사 section을 한국(이 PC, 목록 페이지만 스크롤)·미국(`Collect complete Meta sale USD list`
  액션)에서 수집한 뒤 `node scripts/build-store-coupon-data.mjs <설정.json> <보고서.json>`으로
  `lib/store-coupon-data/<이름>.js`를 만든다. 공개 조회 키로 DB를 읽기만 한다. 통화는 일괄 반영과 같이
  한국 가격이 있으면 원화, 없으면 달러 목록과 맞춘다. 사이트 가격이 목록 가격과 다르거나 목록에 취소선이
  있는 게임은 빼고 보고서에 남긴다. 사이트에 없는 게임은 새로 등록하지 않는다.
- 종료 시각: 행사 페이지에 "12월 1일에 종료"만 있고 시각·시간대가 없었다(상세 페이지 데이터에도 없음).
  추측해서 늦게 끝내지 않도록 한국 시간 12월 1일 23:59로 잡았다. 정확한 시각이 확인되면 설정의
  `ends_at`만 고쳐 다시 생성한다.
- 한계: 행사 section 목록은 한국·미국 모두 정확히 1,000개에서 끝났다. 목록 페이지가 1,000개까지만
  보여 주는 것으로 보여 실제 행사 대상이 더 많을 수 있다.
- 2026-11-25 결과: 한국 1,000개·미국 1,000개 수집, 대상 726개(원화 658·달러 68), 제외 34개
  (사이트 가격이 목록과 다름 26, Meta 가격 인하 8). 기록은 저장소 밖 `work/bf2026-coupon/`.
- 같은 날 GitHub `ubuntu-latest`가 26.04로 바뀌어 Playwright 설치가 실패했다. Playwright를 쓰는
  워크플로는 `ubuntu-24.04`로 고정했다.
- 가격대 필터와 가격순 정렬은 쿠폰 적용 전 스토어 가격 기준이다(코드를 넣어야 적용되므로). 할인율순 정렬만
  쿠폰 할인율을 쓴다. 대상 데이터는 확인한 지역 통화(`game_ids_by_currency`)를 함께 저장하고, 화면 표시
  통화가 바뀐 게임에는 쿠폰을 표시하지 않는다. Meta 자체 할인 중인 대상 게임은 그 할인이 끝나면 쿠폰이 표시된다.
