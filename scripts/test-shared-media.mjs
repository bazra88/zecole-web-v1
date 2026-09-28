import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameMediaNeedsRenewal,needsMediaRenewal,mediaRenewalPatches,refreshIsPending} from '../lib/shared-media-policy.mjs';
import {visitCurrency,metaProductUrl,refreshInlineMedia,hasExpiredInlineMedia} from '../lib/game-visit-policy.mjs';
const now=Date.now();
const signed=(seconds,path='a.mp4')=>`https://cdn.example/${path}?oe=${Math.floor((now+seconds*1000)/1000).toString(16)}`;
const old=signed(-60), fresh=signed(86400);
assert.equal(needsMediaRenewal(old,now),true);
assert.equal(needsMediaRenewal(fresh,now),false);
assert.equal(needsMediaRenewal('https://storage.example/a.webp',now),false);
assert.equal(needsMediaRenewal('https://cdn.example/a?Expires=1',now),true);
assert.equal(gameMediaNeedsRenewal({description_long:`![image](${old})`},[],now),true);
assert.equal(refreshIsPending({attempted_at:new Date(now).toISOString()},now),true);
assert.equal(refreshIsPending({attempted_at:new Date(now-180000).toISOString()},now),false);
const rows=[{id:'media',media_type:'trailer',source:'meta_store',sort_order:0,url:old},
  {id:'stable',media_type:'screenshot',source:'meta_store',sort_order:0,url:'https://storage.example/stable.webp'}];
const raw=[{media_type:'trailer',sort_order:0,url:fresh},{media_type:'screenshot',sort_order:0,url:signed(86400,'new.webp')}];
assert.deepEqual(mediaRenewalPatches(rows,raw).map(r=>r.id),['media']);
assert.equal(mediaRenewalPatches(rows,[]).length,0);

// Exercise the production worker with mocked network/DB boundaries, including
// simultaneous visitors. No production Meta or database requests are made.
const source=(await readFile(new URL('../lib/game-visit-refresh.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const game={id:'game',meta_product_id:'1234567',usd_price:10,description_long:'',description_long_ko:''};
let claimCount=0, fetchCount=0, writes=0, state=null, current=structuredClone(rows), release;
let networkGate=new Promise(resolve=>{release=resolve;});
const adminRest=async(path,options={})=>{
  if(path.startsWith('games?')) return [game];
  if(path.startsWith('game_visit_refresh?')) return state?[state]:[];
  if(path.startsWith('game_media?')&&options.method==='PATCH') {writes++;const patch=JSON.parse(options.body);Object.assign(current[0],patch);return null;}
  if(path.startsWith('game_media?')) return current;
  if(path==='rpc/claim_game_visit_refresh') {
    claimCount++;if(state)return null;
    state={attempted_at:new Date().toISOString(),completed_at:null};
    return {...state,refresh_daily:false,fetch_token:'token'};
  }
  if(path==='rpc/finish_game_visit_refresh') {state.completed_at=new Date().toISOString();state.outcome=JSON.parse(options.body).p_observation.outcome;return {changed:false};}
  if(path.startsWith('meta_fetch_attempts?'))return null;
  throw new Error(`Unexpected DB call ${path}`);
};
const deps={adminRest,relayApp:()=>({}),parseKrw:()=>({}),extractBaseInfo:()=>({}),extractOfferPricing:()=>({}),extractLongDescription:()=>'',translateLongDescription:async()=>'',extractReviews:()=>[],extractMedia:()=>raw,visitCurrency,metaProductUrl,refreshInlineMedia,hasExpiredInlineMedia,gameMediaNeedsRenewal,mediaRenewalPatches,refreshIsPending,
  fetch:async()=>{fetchCount++;await networkGate;return {ok:true,text:async()=>'<fixture>'};}};
const worker=new Function(...Object.keys(deps),`${source};return {refreshGameOnVisit,getVisitRefreshStatus};`)(...Object.values(deps));
const first=worker.refreshGameOnVisit('game');
while(!fetchCount) await new Promise(r=>setTimeout(r,0));
const second=await worker.refreshGameOnVisit('game');
assert.equal(second.pending,true);
assert.equal(fetchCount,1);
release();
assert.equal((await first).changed,true);
assert.equal(writes,1);
assert.equal((await worker.refreshGameOnVisit('game',{mediaOnly:true})).skipped,true);
assert.equal(fetchCount,1);
assert.equal((await worker.getVisitRefreshStatus('game')).pending,false);
// A failed owner finalizes the claim; another visitor must not retry Meta.
state=null; current=structuredClone(rows); networkGate=Promise.reject(new Error('mock_failure'));
const originalError=console.error; console.error=()=>{};
try {
  assert.equal((await worker.refreshGameOnVisit('game')).failed,true);
  const afterFailure=fetchCount;
  assert.equal((await worker.refreshGameOnVisit('game')).failed,true);
  assert.equal(fetchCount,afterFailure);
} finally {console.error=originalError;}
console.log('Shared media policy and worker tests passed (no external calls)');

// Test the real trailer handler: valid and waiting URLs do not trigger Meta.
const routeSource=(await readFile(new URL('../app/api/media/trailer/route.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
let routeRows=[{url:fresh}], routeCalls=0, dbCalls=0;
const routeDeps={
  NextResponse:{json:(body,options)=>Response.json(body,options)},
  adminRest:async path=>{dbCalls++;return path.startsWith('games?')?[{id:'game'}]:routeRows;},
  isBotUserAgent:ua=>!ua||/bot/i.test(ua), needsMediaRenewal,
  refreshGameOnVisit:async()=>{routeCalls++;return {pending:true};},
  getVisitRefreshStatus:async()=>({pending:true}),
  revalidatePath:()=>{},after:()=>{},refreshReviewTranslations:()=>{},
};
const handler=new Function(...Object.keys(routeDeps),`${routeSource};return GET;`)(...Object.values(routeDeps));
const request=(extra='',ua='Mozilla/5.0')=>new Request(`https://zecole.store/api/media/trailer?gameId=00000000-0000-0000-0000-000000000001${extra}`,{headers:{'user-agent':ua}});
assert.equal((await (await handler(request())).json()).url,fresh);
assert.equal(routeCalls,0);
routeRows=[{url:old}];
assert.equal((await handler(request())).status,202);
assert.equal(routeCalls,1);
assert.equal((await handler(request('&cacheOnly=1'))).status,202);
assert.equal(routeCalls,1);
const readsBeforeBot=dbCalls;
assert.equal((await handler(request('','GPTBot'))).status,403);
assert.equal(dbCalls,readsBeforeBot);
console.log('Trailer cache, waiter and bot protection tests passed');
