'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import GameLoadingOverlay from './GameLoadingOverlay';

export default function GameVisitRefresh({ gameId }) {
  const router = useRouter();
  const [checking,setChecking] = useState(true);
  const [failed,setFailed] = useState(false);
  const [pending,startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    fetch('/api/games/visit',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({gameId}),signal:controller.signal})
      .then(async response => {
        const result = await response.json();
        if (!active) return;
        setFailed(!response.ok || Boolean(result.failed));
        window.dispatchEvent(new CustomEvent('game-visit-complete',{detail:gameId}));
        if (result.changed) startTransition(() => router.refresh());
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { clearTimeout(timeout); if (active) setChecking(false); });
    return () => { active=false; clearTimeout(timeout); controller.abort(); };
  },[gameId,router]);
  return <>
    {(checking || pending) && <GameLoadingOverlay />}
    {failed && <p role="status" className="visit-refresh-note">최신 정보를 확인하지 못해 저장된 정보를 표시합니다.</p>}
  </>;
}
