'use client';
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isBotUserAgent } from '@/lib/bot-detect.mjs';
import { runVisitRefresh } from '@/lib/visit-refresh-client.mjs';
import GameLoadingOverlay from './GameLoadingOverlay';

export const MediaRefreshContext=createContext('idle');
export const useMediaRefreshStatus=()=>useContext(MediaRefreshContext);
export default function GameVisitRefresh({gameId,children}) {
  const router=useRouter();
  const [status,setStatus]=useState('checking');
  const [pending,startTransition]=useTransition();
  const notifyCompletion=useRef(false);
  useEffect(()=>{
    if(navigator.webdriver||isBotUserAgent(navigator.userAgent)) {setStatus('idle');return;}
    let active=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),180000);
    (async()=>{
      try {
        const result=await runVisitRefresh(gameId,{signal:controller.signal,onStatus:value=>{if(active)setStatus(value);}});
        if(!active) return;
        notifyCompletion.current=true;
        const finalStatus=result.deferred?'deferred':result.failed||result.pending?'failed':result.priceUnavailable?'partial':'idle';
        // The owner can finish between our rejected claim and status read.
        // Commit the terminal status WITH the new server-rendered prices, not
        // immediately after the API reply while the old prices are still shown.
        if(result.shouldRefresh) startTransition(()=>{
          router.refresh();
          setStatus(finalStatus);
        });
        else setStatus(finalStatus);
      } catch {if(active)setStatus('failed');}
      finally {clearTimeout(timeout);}
    })();
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[gameId,router]);
  const busy=pending || status==='checking' || status==='waiting';
  useEffect(()=>{
    if(!busy && notifyCompletion.current) {
      notifyCompletion.current=false;
      window.dispatchEvent(new CustomEvent('game-visit-complete',{detail:gameId}));
    }
  },[gameId,busy]);
  const message={waiting:'갱신 순서를 기다리고 있습니다. 잠시 후 자동으로 다시 확인합니다.',deferred:'현재 갱신이 잠시 제한되어 저장된 정보를 표시합니다. 잠시 후 다시 방문해 주세요.',failed:'최신 정보를 불러오지 못해 저장된 정보를 표시합니다.',partial:'최신 가격을 확인하지 못해 이전 가격을 표시합니다. 구매 전 Meta 스토어 가격을 확인해 주세요.'}[status];
  return <MediaRefreshContext.Provider value={pending?'checking':status}>
    {busy ? <GameLoadingOverlay phase={pending?'updating':status} /> : null}
    {!busy && message ? <p className="container detail-refresh-status" role="status">{message}</p> : null}
    <div aria-busy={busy} inert={busy || undefined}>
      {children}
    </div>
  </MediaRefreshContext.Provider>;
}
