import assert from 'node:assert/strict';
import {translateReviewText,needsReviewTranslation} from '../lib/review-translation.mjs';

const calls=[];
const fetcher = async url => {
  calls.push(url);
  assert.equal(url.hostname,'translate.googleapis.com');
  assert.equal(url.searchParams.get('sl'),'auto');
  assert.equal(url.searchParams.get('tl'),'ko');
  assert.ok(url.searchParams.get('q').length <= 1500);
  return {ok:true,json:async()=>[[['번역',null]]]};
};
assert.equal(await translateReviewText('a'.repeat(3500),{fetcher}),'번역번역번역');
assert.equal(calls.length,3);
assert.equal(await translateReviewText('  ',{fetcher}),null);
await assert.rejects(translateReviewText('Original',{fetcher:async()=>({ok:false,status:429})}),/429/);
await assert.rejects(translateReviewText('Original',{fetcher:async()=>({ok:true,json:async()=>[]})}),/empty/);
assert.equal(needsReviewTranslation({body_original:'English',body_ko:''}),true);
assert.equal(needsReviewTranslation({body_original:'English',body_ko:'번역'}),false);
assert.equal(needsReviewTranslation({title_original:'Title',body_original:'English',body_ko:'번역'}),true);
console.log('Review translation: chunking, auto language, failure preservation, pending detection passed.');
