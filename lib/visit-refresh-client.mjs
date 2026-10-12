function delay(ms, signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason || new Error('aborted'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted) abort();
  });
}

// At most three claim requests per mounted page. Polling never contacts Meta.
export async function runVisitRefresh(gameId,{signal,onStatus,fetcher=fetch,wait=delay,visible=()=>document.visibilityState==='visible',now=Date.now,random=Math.random}) {
  const startedAt=now();
  let result,joined=false;
  for(let post=0;post<3;post++) {
    if(post && !visible()) return {...result,deferred:true};
    onStatus('checking');
    const response=await fetcher('/api/games/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId}),signal});
    if(!response.ok) throw new Error('visit_failed');
    result=await response.json();
    joined=joined||Boolean(result.pending);
    for(let poll=0;result.pending&&poll<18;poll++) {
      await wait(2500,signal);
      if(!visible()) return {...result,deferred:true};
      const check=await fetcher(`/api/games/visit?gameId=${gameId}`,{signal,cache:'no-store'});
      if(!check.ok) throw new Error('status_failed');
      result=await check.json();
    }
    if(!result.deferred) break;
    const seconds=Number(result.retryAfter);
    if(post===2 || !Number.isFinite(seconds) || seconds<0 || seconds>65) break;
    const ms=Math.max(1000,seconds*1000)+500+Math.floor(random()*1500);
    if(now()+ms-startedAt>150000 || !visible()) break;
    onStatus('waiting');
    await wait(ms,signal);
  }
  return {...result,shouldRefresh:Boolean(result.changed || (result.completedAt && (joined || Date.parse(result.completedAt)>=startedAt-1000)))};
}
