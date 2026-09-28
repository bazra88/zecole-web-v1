'use client';
import { createContext, useContext, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isBotUserAgent } from '@/lib/bot-detect.mjs';

export const MediaRefreshContext=createContext('idle');
export const useMediaRefreshStatus=()=>useContext(MediaRefreshContext);
export default function GameVisitRefresh({gameId,children}) {
  const router=useRouter();
  const [status,setStatus]=useState('checking');
  const [pending,startTransition]=useTransition();
  useEffect(()=>{
    if(navigator.webdriver||isBotUserAgent(navigator.userAgent)) {setStatus('idle');return;}
    let active=true;
    const startedAt=Date.now();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),65000);
    (async()=>{
      try {
        const response=await fetch('/api/games/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId}),signal:controller.signal});
        if(!response.ok) throw new Error('visit_failed');
        let result=await response.json();
        const joined=Boolean(result.pending);
        for(let attempt=0;result.pending&&attempt<18;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,2500));
          if(!active) return;
          const check=await fetch(`/api/games/visit?gameId=${gameId}`,{signal:controller.signal,cache:'no-store'});
          if(!check.ok) throw new Error('status_failed');
          result=await check.json();
        }
        if(!active) return;
        setStatus(result.failed||result.pending?'failed':'idle');
        window.dispatchEvent(new CustomEvent('game-visit-complete',{detail:gameId}));
        // The owner can finish between our rejected claim and status read.
        if(result.changed||(result.completedAt&&(joined||Date.parse(result.completedAt)>=startedAt-1000))) startTransition(()=>router.refresh());
      } catch {if(active)setStatus('failed');}
      finally {clearTimeout(timeout);}
    })();
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[gameId,router]);
  return <MediaRefreshContext.Provider value={pending?'checking':status}>{children}</MediaRefreshContext.Provider>;
}
