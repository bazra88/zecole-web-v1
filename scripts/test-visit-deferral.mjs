import assert from 'node:assert/strict';
import {visitDeferral} from '../lib/visit-deferral-policy.mjs';
import {runVisitRefresh} from '../lib/visit-refresh-client.mjs';
import {snapshotFailure,metaWasBlocked} from '../lib/meta-fetch-result.mjs';

const now=Date.parse('2026-10-12T10:00:00Z');
const ago=seconds=>new Date(now-seconds*1000).toISOString();
const control={paused_until:ago(3600),min_interval_seconds:60,hourly_limit:20,daily_limit:100};
assert.equal(visitDeferral(null,true,control,[{started_at:ago(10),success:true}],now).retryAfter,50);
assert.equal(visitDeferral(null,true,{...control,paused_until:ago(-3600)},[],now).retryAfter,3600);
assert.equal(visitDeferral(null,true,{...control,hourly_limit:2},[{started_at:ago(61)},{started_at:ago(120)}],now).retryAfter,3480);
assert.equal(visitDeferral(null,true,{...control,daily_limit:2},[{started_at:ago(3601)},{started_at:ago(7200)}],now).retryAfter,79200);
const checked={daily_attempted_at:ago(120),attempted_at:ago(120)};
assert.deepEqual(visitDeferral(checked,false,control,[],now),{});
assert.equal(visitDeferral(checked,true,control,[],now).retryAfter,3480);
assert.equal(visitDeferral(null,true,control,[10,70,140].map(t=>({started_at:ago(t),success:false})),now).retryAfter,3600);
const adaptive={...control,min_interval_seconds:15,media_priority_until:ago(-90)};
assert.equal(visitDeferral(null,true,adaptive,[{started_at:ago(10),success:true}],now).retryAfter,5);
assert.equal(visitDeferral(null,true,adaptive,[{started_at:ago(20),success:null}],now).retryAfter,15);
assert.equal(visitDeferral(null,true,adaptive,[{started_at:ago(121),success:null}],now).retryAfter,1);
assert.equal(visitDeferral(null,false,adaptive,[],now).retryAfter,90);
assert.equal(visitDeferral(null,true,adaptive,[],now).retryAfter,1);
assert.equal(await snapshotFailure(Response.json({error:'meta_429'},{status:400}),'KRW'),'meta_429');
assert.equal(await snapshotFailure(Response.json({error:'meta_403'},{status:400}),'KRW'),'meta_403');
assert.equal(await snapshotFailure(Response.json({error:'invalid_claim'},{status:400}),'KRW'),'kr_snapshot_400');
assert.equal(await snapshotFailure(new Response('not json',{status:502}),'KRW'),'kr_snapshot_502');
assert.equal(metaWasBlocked(new Error('meta_429')),true);
assert.equal(metaWasBlocked(new Error('us_snapshot_403')),true);
assert.equal(metaWasBlocked(new Error('kr_snapshot_400')),false);

async function simulate(bodies,overrides={}) {
  let tick=now;
  const calls=[],waits=[],statuses=[];
  const options={signal:new AbortController().signal,onStatus:s=>statuses.push(s),
    fetcher:async(url,options)=>{calls.push({url,method:options.method||'GET'});const body=bodies.shift();assert.ok(body,'unexpected extra request');return Response.json(body);},
    wait:async ms=>{waits.push(ms);tick+=ms;},visible:()=>true,now:()=>tick,random:()=>0,...overrides};
  const result=await runVisitRefresh('game',options);
  return {result,calls,waits,statuses};
}
// A quick second game waits for the regional interval, then gets fresh media.
const recovered=await simulate([{deferred:true,retryAfter:50},{changed:true}]);
assert.equal(recovered.calls.length,2);
assert.equal(recovered.waits[0],50500);
assert.ok(recovered.statuses.includes('waiting'));
assert.equal(recovered.result.shouldRefresh,true);
// A concurrent visitor joins using GET only; no extra Meta claim.
const joined=await simulate([{pending:true},{pending:false,completedAt:ago(-5),priceUnavailable:true}]);
assert.deepEqual(joined.calls.map(c=>c.method),['POST','GET']);
assert.equal(joined.result.shouldRefresh,true);
assert.equal(joined.result.priceUnavailable,true);
// Long pauses/failures/network errors never turn into automatic request loops.
assert.equal((await simulate([{deferred:true,retryAfter:3600}])).calls.length,1);
assert.equal((await simulate([{failed:true}])).calls.length,1);
assert.equal((await simulate([{deferred:true,retryAfter:30}],{visible:()=>false})).calls.length,1);
const contention=await simulate(Array.from({length:3},()=>({deferred:true,retryAfter:1})));
assert.equal(contention.calls.length,3);
assert.equal(contention.result.deferred,true);
await assert.rejects(()=>simulate([],{fetcher:async()=>Response.json({}, {status:503})}),/visit_failed/);
// Leaving the page aborts the waiting timer and prevents a second claim.
const controller=new AbortController();
await assert.rejects(()=>simulate([{deferred:true,retryAfter:1}],{signal:controller.signal,wait:async()=>{controller.abort();throw new Error('aborted');}}),/aborted/);
console.log('Visit deferral, bounded retry, polling and cancellation tests passed (no external calls)');
