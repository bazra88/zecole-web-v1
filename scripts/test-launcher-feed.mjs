// 런처용 신규 게임 응답(lib/launcher-feed.mjs) 모의 검사. 네트워크·DB를 쓰지 않는다.
import assert from 'node:assert/strict';
import { cardPriceDisplay } from '../lib/game-format.js';
import { launcherGameItem, launcherNewGamesPayload, launcherPrice } from '../lib/launcher-feed.mjs';

const now = new Date('2026-11-23T06:00:00Z');
const imageUrl = (path) => (path ? (path.startsWith('http') ? path : `https://img.test/${path}`) : null);
const base = { id: 'internal-1', name: '테스트 게임', slug: 'test-game', release_date: '2026-11-20', image_path: 'games/a.webp', rating: 4.6, review_count: 120, admin_new_release_order: 3, admin_hidden: false };

// 제휴 링크가 있는 원화 게임: 기본 제휴 10% 할인가가 표시가격
const krwAffiliate = { ...base, pricing_type: 'paid', krw_price: 32000, affiliate_url: 'https://aff.test/x' };
assert.deepEqual(launcherPrice(krwAffiliate, now), { priceLabel: '￦28,800', originalPriceLabel: '￦32,000', discountPercent: 10 });

// Meta 자체 할인 중: 제휴 할인을 겹치지 않음
const krwSale = { ...krwAffiliate, krw_price: 16400, meta_store_original_price: 27400, meta_store_offer_ends_at: '2026-12-01T00:00:00Z' };
assert.deepEqual(launcherPrice(krwSale, now), { priceLabel: '￦16,400', originalPriceLabel: '￦27,400', discountPercent: 40 });

// 행사 종료 후: 저장된 정상가로 표시를 복구하고 제휴 할인으로 돌아감
const krwSaleEnded = { ...krwSale, meta_store_offer_ends_at: '2026-11-02T07:59:00Z' };
assert.deepEqual(launcherPrice(krwSaleEnded, now), { priceLabel: '￦24,660', originalPriceLabel: '￦27,400', discountPercent: 10 });

// 제휴 링크 없는 USD 게임: 할인 없음
const usdPlain = { ...base, pricing_type: 'paid', krw_price: null, usd_price: 19.99, currency: 'USD', region_restricted: true };
assert.deepEqual(launcherPrice(usdPlain, now), { priceLabel: '$19.99', originalPriceLabel: null, discountPercent: null });

// 무료 게임
const free = { ...base, pricing_type: 'free_to_play', affiliate_url: 'https://aff.test/y' };
assert.deepEqual(launcherPrice(free, now), { priceLabel: '무료', originalPriceLabel: null, discountPercent: null });

// 가격 미확인은 0원/무료로 만들지 않고 null
const unknown = { ...base, pricing_type: 'paid', krw_price: null, usd_price: null, current_price: null };
assert.deepEqual(launcherPrice(unknown, now), { priceLabel: null, originalPriceLabel: null, discountPercent: null });

// 카드 화면 계산과 같은 값인지
for (const game of [krwAffiliate, krwSale, krwSaleEnded, usdPlain, free]) {
  const card = cardPriceDisplay(game, null, now);
  const item = launcherPrice(game, now);
  const shown = card.storeSale ? card.price.primary : card.discountedPrice || card.price.primary;
  assert.equal(item.priceLabel, shown);
}

// 항목 형식: 약속한 필드만 있고 내부 값은 없음
const item = launcherGameItem(krwAffiliate, { imageUrl, now });
assert.deepEqual(Object.keys(item), ['name', 'slug', 'url', 'image', 'releaseDate', 'pricing', 'priceLabel', 'originalPriceLabel', 'discountPercent', 'rating', 'reviewCount']);
assert.equal(item.url, 'https://zecole.store/games/test-game');
assert.equal(item.image, 'https://img.test/games/a.webp');
assert.equal(item.pricing, 'paid');
assert.equal(launcherGameItem(free, { imageUrl, now }).pricing, 'free');
assert.equal(launcherGameItem({ ...base, image_path: null, source_image_url: 'https://cdn.test/s.jpg' }, { imageUrl, now }).image, 'https://cdn.test/s.jpg');
assert.equal(launcherGameItem({ ...base, image_path: null, source_image_url: null, rating: null, review_count: null, release_date: null }, { imageUrl, now }).image, null);
const empty = launcherGameItem({ ...base, rating: 0, review_count: null, release_date: null }, { imageUrl, now });
assert.equal(empty.rating, null);
assert.equal(empty.reviewCount, null);
assert.equal(empty.releaseDate, null);

// 전체 응답: 최대 8개, 순서 유지
const games = Array.from({ length: 15 }, (_, i) => ({ ...krwAffiliate, id: `g${i}`, slug: `game-${i}`, name: `게임 ${i}` }));
const payload = launcherNewGamesPayload(games, { imageUrl, now });
assert.equal(payload.version, 1);
assert.equal(payload.updatedAt, '2026-11-23T06:00:00.000Z');
assert.equal(payload.listUrl, 'https://zecole.store/games?sort=release_desc');
assert.equal(payload.items.length, 8);
assert.deepEqual(payload.items.map((x) => x.slug), games.slice(0, 8).map((g) => g.slug));
assert.ok(!JSON.stringify(payload).includes('internal-1'));
assert.ok(!JSON.stringify(payload).includes('admin_'));
assert.deepEqual(launcherNewGamesPayload([], { imageUrl, now }).items, []);

console.log('런처 신규 게임 응답: 가격 표기(제휴·Meta 할인·종료 복구·USD·무료·미확인), 필드 형식, 8개 제한·순서 검사 통과');
