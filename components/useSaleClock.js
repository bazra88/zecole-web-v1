"use client";

import { useEffect, useState } from "react";

// Hydrate from the server timestamp, then correct cached pages and open tabs.
// No router refresh, API requests or repeated Meta collection at the deadline.
export function useSaleClock(endsAt, renderedAt) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const end = Date.parse(endsAt);
    if (!Number.isFinite(end)) return;
    let timer;
    const check = () => {
      clearTimeout(timer);
      const time = Date.now();
      setNow(time);
      if (time < end) timer = setTimeout(check, Math.min(end - time + 20, 2_147_483_647));
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
