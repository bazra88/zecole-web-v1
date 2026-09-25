"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function PinnedFilter({ checked }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="admin-pinned-filter">
    <input type="checkbox" checked={checked} disabled={pending} onChange={event => {
      const href = event.target.checked ? "/admin?pinned=1" : "/admin";
      startTransition(() => router.push(href));
    }} />
    신작 고정 게임만 보기 {pending ? "· 불러오는 중…" : ""}
  </label>;
}
