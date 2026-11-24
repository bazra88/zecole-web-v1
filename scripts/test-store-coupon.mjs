// 쿠폰 행사 표시(game.store_coupon) 모의 검사. 네트워크·DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { cardPriceDisplay, displayedDiscountPercent, effectiveAffiliateDiscount, priceChangeTimes, storeCouponInfo } from '../lib/game-format.js';
import { launcherPrice } from '../lib/launcher-feed.mjs';
import { attachStoreCoupon, attachStoreCoupons } from '../lib/store-coupons.js';
import bf2026 from '../lib/store-coupon-data/bf2026.js';

const now = new Date('2026-11-25T03:00:00Z');
const coupon = { code: 'BF2026', percent: 40, currency: 'KRW', starts_at: null, ends_at: '2026-12-01T23:59:00+09:00', end_label: '12월 1일 종료' };
const base = { id: 'g1', name: '테스트', slug: 'test', pricing_type: 'paid', affiliate_url: 'https://aff.test/x' };

// 원화 쿠폰: 정상가 그대로, 쿠폰가 40%, 제휴 10%는 끔
const krw = { ...base, krw_price: 30800, store_coupon: coupon };
let card = cardPriceDisplay(krw, null, now);
assert.equal(card.price.primary, '￦30,800');
assert.equal(card.couponPrice, '￦18,480');
assert.equal(card.coupon.code, 'BF2026');
assert.equal(card.affiliateDiscount, 0);
assert.equal(card.discountedPrice, null);
assert.equal(card.storeSale, null);
assert.equal(displayedDiscountPercent(krw, now), 40);
assert.equal(effectiveAffiliateDiscount(krw, now).percent, 0);

// 달러(지역락) 쿠폰: 달러로 표시
const usd = { ...base, krw_price: null, usd_price: 19.99, currency: 'USD', region_restricted: true, store_coupon: { ...coupon, currency: 'USD' } };
card = cardPriceDisplay(usd, null, now);
assert.equal(card.price.primary, '$19.99');
assert.equal(card.couponPrice, '$11.99');
assert.equal(card.price.regional, true);

// 종료 시각이 지나면 원래 표시(제휴 10%)로 돌아감
const after = new Date('2026-12-01T15:00:00Z');
card = cardPriceDisplay(krw, null, after);
assert.equal(card.coupon, null);
assert.equal(card.couponPrice, null);
assert.equal(card.affiliateDiscount, 10);
assert.equal(card.discountedPrice, '￦27,720');
assert.equal(displayedDiscountPercent(krw, after), 10);

// 시작 전에는 표시하지 않음
assert.equal(storeCouponInfo({ ...krw, store_coupon: { ...coupon, starts_at: '2026-11-26T00:00:00Z' } }, now), null);

// Meta 자체 할인 중인 게임에는 쿠폰가를 얹지 않음
const sale = { ...krw, krw_price: 16400, meta_store_original_price: 27400, meta_store_offer_ends_at: '2026-12-02T00:00:00Z' };
card = cardPriceDisplay(sale, null, now);
assert.equal(card.coupon, null);
assert.equal(card.storeSale.percent, 40);
assert.equal(card.price.primary, '￦16,400');

// 지난 할인이 끝나 정상가로 복구된 게임은 복구된 정상가 기준으로 쿠폰가 계산
const ended = { ...krw, krw_price: 16400, meta_store_original_price: 27400, meta_store_offer_ends_at: '2026-11-02T07:59:00Z' };
card = cardPriceDisplay(ended, null, now);
assert.equal(card.price.primary, '￦27,400');
assert.equal(card.couponPrice, '￦16,440');

// 확인한 지역 통화와 표시 통화가 다르면 표시하지 않음(미국 목록에서 확인했는데 한국 가격이 생긴 경우)
assert.equal(storeCouponInfo({ ...krw, store_coupon: { ...coupon, currency: 'USD' } }, now), null);
// 원화 current_price만 있는 옛 행도 원화로 계산
assert.equal(cardPriceDisplay({ ...base, krw_price: null, current_price: 30000, currency: 'KRW', store_coupon: coupon }, null, now).couponPrice, '￦18,000');

// 무료·가격 미확인·잘못된 값은 쿠폰 없음
assert.equal(storeCouponInfo({ ...krw, pricing_type: 'free' }, now), null);
assert.equal(storeCouponInfo({ ...base, krw_price: null, usd_price: null, store_coupon: coupon }, now), null);
assert.equal(storeCouponInfo({ ...krw, store_coupon: { ...coupon, percent: 0 } }, now), null);
assert.equal(storeCouponInfo({ ...krw, store_coupon: { ...coupon, ends_at: 'x' } }, now), null);

// 런처 응답에는 쿠폰을 넣지 않음(기존처럼 제휴 10%)
assert.deepEqual(launcherPrice(krw, now), { priceLabel: '￦27,720', originalPriceLabel: '￦30,800', discountPercent: 10 });

// 시계에 넘길 시각들: 지난 시각도 포함(캐시된 페이지 보정), 정렬·중복 제거, 렌더마다 같은 문자열
assert.equal(priceChangeTimes(krw), '2026-12-01T14:59:00.000Z');
assert.equal(priceChangeTimes({ ...krw, meta_store_offer_ends_at: '2026-11-02T07:59:00Z' }), '2026-11-02T07:59:00.000Z|2026-12-01T14:59:00.000Z');
assert.equal(priceChangeTimes({ ...base, krw_price: 30800 }), null);

// 데이터 파일과 서버 연결
assert.equal(bf2026.code, 'BF2026');
assert.equal(bf2026.percent, 40);
assert.ok(Date.parse(bf2026.ends_at) > Date.parse('2026-11-25T00:00:00Z'));
const allIds = [...bf2026.game_ids_by_currency.KRW, ...bf2026.game_ids_by_currency.USD];
assert.equal(new Set(allIds).size, allIds.length, '게임 ID 중복(통화 사이 포함)');
assert.ok(allIds.every((id) => /^[0-9a-f-]{36}$/.test(id)), '게임 ID 형식');
const target = bf2026.game_ids_by_currency.KRW[0];
assert.equal(attachStoreCoupon({ id: target }, now).store_coupon.code, 'BF2026');
assert.equal(attachStoreCoupon({ id: target }, now).store_coupon.currency, 'KRW');
assert.equal(attachStoreCoupon({ id: bf2026.game_ids_by_currency.USD[0] }, now).store_coupon.currency, 'USD');
assert.equal(attachStoreCoupon({ id: '00000000-0000-0000-0000-000000000000' }, now).store_coupon, undefined);
assert.equal(attachStoreCoupon({ id: target }, after).store_coupon, undefined, '종료 뒤에는 붙이지 않음');
assert.equal(attachStoreCoupons([{ id: target }, { name: 'id 없음' }], now)[1].store_coupon, undefined);

console.log('쿠폰 표시 검사 통과');
