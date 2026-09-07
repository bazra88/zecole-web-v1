"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DOCK_GROUPS = [
  [
    {
      href: "/quest",
      label: "퀘스트",
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="8" width="19" height="10" rx="4" strokeLinejoin="round" />
          <circle cx="8.3" cy="13" r="2.1" />
          <circle cx="15.7" cy="13" r="2.1" />
        </svg>
      ),
    },
    {
      href: "/rayban-meta",
      label: "레이벤",
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6.2" cy="14" r="3.4" />
          <circle cx="17.8" cy="14" r="3.4" />
          <path d="M9.6 13h4.8M2.5 12l2.2-4.5h3M21.5 12l-2.2-4.5h-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ],
  [
    {
      href: "/games?sort=reviews",
      label: "인기",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.5-.8-2-1-3.2 1.6.9 3 2.9 3 5.2a5 5 0 0 1-10 0C7 8 10 6 12 2z" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: "/games?recommend=beginner",
      label: "초보자",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21V10M12 10C12 6 9 4 5 4c0 5 3 7 7 7Z" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/games?recommend=advanced",
      label: "숙련자",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3c2.5 2 4 5 4 9l-4 4-4-4c0-4 1.5-7 4-9Z" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="1.4" fill="currentColor" stroke="none" />
          <path d="M9 16l-2 4 4-2M15 16l2 4-4-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ],
];

export default function FloatingDock() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="floating-dock" aria-label="빠른 이동 메뉴">
      {DOCK_GROUPS.map((group, groupIndex) => (
        <div className="dock-group" key={groupIndex}>
          {groupIndex > 0 ? <div className="dock-divider" /> : null}
          {group.map((item) => (
            <Link key={item.href} href={item.href} className="dock-icon" title={item.label}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="dock-divider" />
      <button
        type="button"
        className={`dock-icon dock-top${showTop ? " is-visible" : ""}`}
        aria-label="맨 위로 이동"
        title="맨 위로"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
