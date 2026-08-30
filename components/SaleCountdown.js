"use client";

import { useEffect, useState } from "react";

function remainingLabel(milliseconds) {
  if (milliseconds <= 0) return null;

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 ${seconds}초 남음`;
}

export default function SaleCountdown({ endsAt }) {
  const endTime = Date.parse(endsAt);
  const [label, setLabel] = useState(null);

  useEffect(() => {
    function update() {
      setLabel(remainingLabel(endTime - Date.now()));
    }

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [endTime]);

  if (!label) return null;
  return <span className="game-sale-countdown"><span aria-hidden="true">◷</span> {label}</span>;
}
