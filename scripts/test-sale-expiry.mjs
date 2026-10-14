import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { storeDiscountInfo, storeOfferExpired, formatGamePrice, discountedPriceLabel, displayedDiscountPercent } from '../lib/game-format.js';

const end = '2026-09-29T16:00:00+09:00';
const before = new Date('2026-09-29T06:59:59.999Z'), after = new Date('2026-09-29T07:00:00Z');
const game = { pricing_type: 'paid', krw_price: 4000, usd_price: 9.99, currency: 'USD', meta_store_original_price: 10000, meta_store_offer_ends_at: end, affiliate_url: 'https://example.com', affiliate_discount_percent: 10 };
const original = structuredClone(game);
assert.equal(storeDiscountInfo(game, before).percent, 60);
assert.equal(storeDiscountInfo(game, after), null);
assert.equal(formatGamePrice(game, null, 0, after).primary, '￦10,000');
assert.equal(discountedPriceLabel(game, 10, after), '￦9,000');
assert.equal(displayedDiscountPercent(game, after), 10);
assert.deepEqual(game, original, 'display expiry must not rewrite observations');
for (const deadline of [null, '', 'invalid']) assert.equal(storeOfferExpired({...game, meta_store_offer_ends_at: deadline}, after), false);
assert.equal(storeOfferExpired({...game, pricing_type:'free'}, after), false);
assert.equal(storeOfferExpired({...game, meta_store_original_price: 3000}, after), false);
const usd = {...game, krw_price:null, usd_price:5, meta_store_original_price:10, krw_converted_price:7000, region_restricted:true};
assert.deepEqual(formatGamePrice(usd, null, 10, after), {primary:'$10.00',secondary:'약 ￦12,600',regional:true});
assert.equal(formatGamePrice(usd, 1500, 10, after).secondary, '약 ￦13,500');
assert.equal(formatGamePrice({...usd,usd_price:0}, null, 10, after).secondary, null);
assert.equal(storeDiscountInfo({...game, meta_store_offer_ends_at:'2026-10-29T07:00:00Z'},after).percent,60);

const dir = await mkdtemp(join(tmpdir(),'sale-expiry-test-'));
try {
  const input = join(dir,'plan.json'), output=join(dir,'result.sql');
  const row={id:'11111111-1111-1111-1111-111111111111',currency:'KRW',current_price:4000,original_price:10000,checked_at:'2026-09-23T00:00:00Z'};
  const run=plan=>{execFileSync(process.execPath,['scripts/build-meta-sale-sql.mjs',input,output],{stdio:'pipe'});};
  await writeFile(input,JSON.stringify({campaign_ends_at:end,updates:[row]}));run();
  let sql=await readFile(output,'utf8');
  assert.match(sql,/"offer_ends_at":"2026-09-29T07:00:00.000Z"/);
  assert.match(sql,/checked_at, sale_ends_at/);
  await writeFile(input,JSON.stringify({campaign_ends_at:end,updates:[{...row,offer_ends_at:null}]}));run();
  assert.match(await readFile(output,'utf8'),/"offer_ends_at":null/);
  await writeFile(input,JSON.stringify({campaign_ends_at:'2026-09-29T16:00:00',updates:[row]}));
  assert.throws(run);
  await writeFile(input,JSON.stringify({campaign_ends_at:'2026-09-22T00:00:00Z',updates:[row]}));
  assert.throws(run);
} finally {
  await rm(join(dir,'plan.json'),{force:true});
  await rm(join(dir,'result.sql'),{force:true});
  await rmdir(dir);
}
console.log('Sale expiry: exact boundary, currencies, affiliate restore, history immutability, missing/invalid deadlines, USD estimates and import validation passed');
