// Read-only, logged-out list collector. Never visits game details or writes to DB.
import { mkdir, writeFile } from 'node:fs/promises';
import { readMetaList } from './meta-list-dom.mjs';
const url = 'https://www.meta.com/ko-kr/experiences/section/3878844519028756/';
const expected = process.env.EXPECTED_CURRENCY;
if (!['KRW','USD'].includes(expected)) throw new Error('Expected currency required');
if (process.env.SERVER_CHROMIUM === '1' && process.env.LIST_MEMORY_ISOLATED !== '1') {
  throw new Error('Run only inside a memory-limited cgroup; Seoul first trial exhausted available RAM.');
}
const output = process.env.LIST_OUTPUT || `full-list-${expected}`;
await mkdir(output,{recursive:true});
let browser;
if (process.env.SERVER_CHROMIUM === '1') {
  const {chromium} = await import('playwright-core');
  const {default:binary} = await import('@sparticuz/chromium');
  browser = await chromium.launch({executablePath:await binary.executablePath(),args:binary.args,headless:true});
} else {
  const {chromium} = await import('playwright');
  browser = await chromium.launch({headless:false});
}
const context = await browser.newContext({viewport:{width:1280,height:900},locale:'ko-KR'});
// Card image URLs remain in DOM. Do not decode thousands of thumbnails on a 1GB server.
await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
const page = await context.newPage();
const started = Date.now(), rows = new Map(), progress = [], network = new Map(), offers = new Map();
const tasks = new Set();
let fatal = null, complete = false, reason = null, lastGrowth = started, stableBottom = null, jsonResponses = 0, offerObjects = 0;
// Observe only responses the normal page already requests; never replay requests.
page.on('response', response => {
  const request = response.request(), type = request.resourceType(), u = new URL(response.url());
  const key = `${type} ${u.hostname}${u.pathname} ${response.status()}`;
  network.set(key,(network.get(key)||0)+1);
  const api = ['xhr','fetch','document'].includes(type) && /(^|\.)meta\.com$/.test(u.hostname);
  if (api && [403,429].includes(response.status())) fatal = `http_${response.status()}`;
  if (!api || !/json/.test(response.headers()['content-type']||'')) return;
  const task = (async()=>{
    let data; try {data=await response.json();} catch{return;}
    jsonResponses++;
    const visit = (v, depth=0) => {
      if (!v || typeof v !== 'object' || depth>60) return;
      if (v.current_offer && typeof v.current_offer==='object') {
        offerObjects++;
        const id = String(v.id || v.app_id || '');
        const o = v.current_offer;
        if (/^\d{6,}$/.test(id)) offers.set(id,{meta_id:id,end_time:o.end_time??null,show_timer:o.show_timer??null,keys:Object.keys(o)});
      }
      for (const child of Object.values(v)) visit(child,depth+1);
    };
    visit(data);
  })();
  tasks.add(task); task.finally(()=>tasks.delete(task));
});
async function save() {
  const items=[...rows.values()];
  const summary={source:url,expected_currency:expected,started_at:new Date(started).toISOString(),finished_at:new Date().toISOString(),complete,section_complete:complete,full_catalog_complete:false,coverage_warning:'End of this section does not establish complete store coverage; first US trial ended at exactly 1000.',reason,count:items.length,priced:items.filter(r=>r.current_price!=null).length,discounted:items.filter(r=>r.current_price!=null&&r.original_price>r.current_price).length,wrong_currency:items.filter(r=>r.currency&&r.currency!==expected).length,ambiguous_prices:items.filter(r=>r.price_ambiguous).length,json_responses:jsonResponses,offer_objects:offerObjects,offers_with_end_time:[...offers.values()].filter(o=>o.end_time!=null).length,network:Object.fromEntries(network),progress};
  await writeFile(`${output}/games.json`,JSON.stringify(items,null,2));
  await writeFile(`${output}/offers.json`,JSON.stringify([...offers.values()],null,2));
  await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2));
  return summary;
}
try {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(5000);
  await page.mouse.move(640,500);
  while(Date.now()-started < 55*60000) {
    if(fatal) {reason=fatal;break;}
    const cancel=page.getByRole('button',{name:'취소',exact:true});
    if(await cancel.isVisible().catch(()=>false)) await cancel.click();
    const state=await page.evaluate(readMetaList);
    if(state.blocked) {reason='block_message';break;}
    const before=rows.size;
    for(const row of state.cards) rows.set(row.meta_id,row);
    if(rows.size>before) {lastGrowth=Date.now();stableBottom=null;}
    const {cards,blocked,...position}=state;
    progress.push({seconds:Math.round((Date.now()-started)/1000),count:rows.size,...position});
    if(rows.size>before||progress.length%10===0) console.log(JSON.stringify(progress.at(-1)));
    if(progress.length%20===0) await save();
    if([...rows.values()].some(r=>r.currency&&r.currency!==expected)) {reason='currency_mismatch';break;}
    if(state.bottom&&!state.pending&&rows.size) {
      stableBottom??=Date.now();
      if(Date.now()-stableBottom>=45000&&Date.now()-lastGrowth>=45000) {complete=true;reason='stable_end_of_list';break;}
    } else stableBottom=null;
    if(Date.now()-lastGrowth>120000) {reason='stalled';break;}
    if(state.pending&&state.pending_y<150) await page.mouse.wheel(0,state.pending_y-350);
    else if(state.pending&&state.pending_y<800) { /* Keep unloaded cards in view. */ }
    else if(!state.bottom) await page.mouse.wheel(0,620);
    await page.waitForTimeout(3000);
  }
  reason??='time_limit';
} catch(e) {reason=`error: ${e.message}`;}
await Promise.allSettled([...tasks]);
const summary=await save();
await page.screenshot({path:`${output}/final.png`}).catch(()=>{});
await browser.close();
console.log(JSON.stringify({...summary,network:undefined,progress:undefined}));
if(!complete||summary.wrong_currency||summary.ambiguous_prices) process.exitCode=1;
