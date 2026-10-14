import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../app/api/games/visit/route.js',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const calls=[];
const deps={refreshGameOnVisit:async(...args)=>{calls.push(args);return {skipped:true};},
  getVisitRefreshStatus:async()=>({pending:false}),revalidatePath:()=>{},after:()=>{},
  refreshReviewTranslations:()=>{},isBotUserAgent:ua=>!ua||/bot/i.test(ua)};
const {POST}=new Function(...Object.keys(deps),`${source};return {POST};`)(...Object.values(deps));
const gameId='00000000-0000-4000-8000-000000000001',visitId='00000000-0000-4000-8000-000000000002';
const req=(body,headers={})=>new Request('https://zecole.store/api/games/visit',{
  method:'POST',headers:{origin:'https://zecole.store','user-agent':'Mozilla/5.0','content-type':'application/json',...headers},body:JSON.stringify(body)});
assert.equal((await POST(req({gameId,visitId,attempt:2}))).status,200);
assert.deepEqual(calls[0],[gameId,{visitId,attempt:2}]);
assert.equal((await POST(req({gameId}))).status,200); // older clients remain compatible
for(const body of [{gameId,visitId:'bad'},{gameId,visitId:null},{gameId,visitId,attempt:3},{gameId,visitId,attempt:-1},{gameId,visitId,attempt:0.5}]) {
  assert.equal((await POST(req(body))).status,400);
}
assert.equal((await POST(req({gameId,visitId},{origin:'https://other.example'}))).status,403);
await POST(req({gameId,visitId},{'user-agent':'GPTBot'}));
assert.equal(calls.length,2,'invalid/bot requests must not reach telemetry or Meta');
console.log('Visit telemetry validation, legacy compatibility and bot exclusion passed');
