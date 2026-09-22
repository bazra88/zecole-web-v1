import assert from 'node:assert/strict';
import { displayedDiscountPercent } from '../lib/game-format.js';

const now = new Date('2026-09-23T00:00:00Z');
const base = { pricing_type: 'paid', affiliate_url: 'https://example.com', base_affiliate_discount_percent: 10 };
const rows = [
  { ...base, id: 'a', name: 'Affiliate', krw_price: 10000 },
  { ...base, id: 'b', name: 'Expired', krw_price: 10000, promo_affiliate_discount_percent: 90, promo_ends_at: '2020-01-01' },
  { ...base, id: 'c', name: 'KR sale', krw_price: 2000, meta_store_original_price: 10000 },
  { ...base, id: 'd', name: 'US sale', krw_price: null, usd_price: 5, currency: 'USD', meta_store_original_price: 10 },
  { ...base, id: 'e', name: 'Free', pricing_type: 'free', krw_price: 0 },
];
assert.deepEqual(rows.map(row => displayedDiscountPercent(row, now)), [10, 10, 80, 50, 0]);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test';
const calls = [];
globalThis.fetch = async input => {
  const p = new URL(input).searchParams;
  calls.push(p);
  assert.equal(p.get('active'), 'eq.true');
  assert.equal(p.get('admin_hidden'), 'eq.false');
  assert.equal(p.get('name'), 'ilike.*sale*');
  const ids = p.get('id');
  const data = ids ? rows.filter(row => ids.includes(row.id)).reverse()
    : rows.slice(Number(p.get('offset')), Number(p.get('offset')) + 2);
  return new Response(JSON.stringify(data), { headers: { 'content-range': `0-1/${rows.length}` } });
};
const { getGames } = await import('../lib/supabase.js');
const first = await getGames({ sortDiscount: true, search: 'sale', limit: 2, count: true });
assert.deepEqual(first.data.map(row => row.id), ['c', 'd']);
assert.equal(first.count, 5);
assert.equal(calls.length, 4, 'must traverse server-capped batches before paging');
const second = await getGames({ sortDiscount: true, search: 'sale', limit: 2, offset: 2 });
assert.deepEqual(second.data.map(row => row.id), ['a', 'b']);
console.log('Discount sort: currencies, expired promos, free games, capped batches, filters and pagination passed');
