"use client";

import { useEffect, useState } from "react";

// Hydrate from the server timestamp, then correct cached pages and open tabs.
// No router refresh, API requests or repeated Meta collection at the deadline.
// endsAt은 시각 하나 또는 "시각|시각" 문자열(Meta 할인 종료·쿠폰 종료). 지난 시각이 있어도
// 한 번은 현재 시각으로 고치고, 남은 시각 중 가장 가까운 것마다 다시 그린다.
export function useSaleClock(endsAt, renderedAt) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const ends = String(endsAt ?? "").split("|").map((value) => Date.parse(value)).filter(Number.isFinite);
    if (!ends.length) return;
    let timer;
    const check = () => {
      clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      const next = Math.min(...ends.filter((end) => end > time));
      if (Number.isFinite(next)) timer = setTimeout(check, Math.min(next - time + 20, 2_147_483_647));
    };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [endsAt, renderedAt]);
  return new Date(now);
}
