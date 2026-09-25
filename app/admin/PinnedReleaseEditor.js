"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNewReleaseOrderAction } from "./actions";
import { compareReleaseDates } from "@/lib/new-release-order.mjs";

export default function PinnedReleaseEditor({ games }) {
  const [items, setItems] = useState(games);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const changed = items.some((game, index) => game.id !== games[index]?.id);
  function move(index, target) {
    setItems(current => {
      const next = [...current];
      next.splice(target, 0, next.splice(index, 1)[0]);
      return next;
    });
    setMessage(null);
  }
  function save() {
    startTransition(async () => {
      const expected = Object.fromEntries(games.map(game => [game.id, {
        rank: game.admin_new_release_order ?? null, active: game.active, hidden: game.admin_hidden,
      }]));
      const result = await saveNewReleaseOrderAction(items.map(game => game.id), expected);
      setMessage(result);
      if (result.success) router.refresh();
    });
  }
  let visibleIndex = 0;
  return <div className="admin-pinned-editor" aria-busy={pending}>
    <p className="admin-order-help">위·아래 또는 맨 위로 이동한 뒤 순서를 저장하세요. 저장한 고정 게임이 메인 신작 영역에 먼저 표시되며, 최대 15개까지 노출됩니다. 숨김·비활성 게임은 제외됩니다.</p>
    <div className="admin-order-toolbar">
      <button type="button" className="admin-pinned" onClick={save} disabled={pending || !changed}>{pending ? "저장 중…" : "순서 저장"}</button>
      <button type="button" className="admin-secondary" disabled={pending} onClick={() => { setItems([...items].sort(compareReleaseDates)); setMessage(null); }}>출시일 순으로 배치</button>
      <button type="button" className="admin-cancel" disabled={pending || !changed} onClick={() => { setItems(games); setMessage(null); }}>변경 취소</button>
      <span role="status">{changed ? "저장하지 않은 변경사항이 있습니다." : "현재 저장된 순서입니다."}</span>
    </div>
    {message && <p role="status" className={`admin-message ${message.error ? "error" : "success"}`}>{message.error || message.success}</p>}
    <ol className="admin-order-list">
      {items.map((game, index) => {
        const visible = game.active && !game.admin_hidden;
        const position = visible ? ++visibleIndex : null;
        return <li key={game.id} className="admin-order-row">
          <span className="admin-order-number">{index + 1}</span>
          {game.thumbnail ? <img src={game.thumbnail} alt="" width="80" height="60" /> : null}
          <div className="admin-order-info"><strong>{game.name}</strong><span>{game.release_date || "출시일 미확인"} · {!visible ? "메인 미노출" : position <= 15 ? `메인 ${position}번째` : "15개 제한으로 미노출"}</span></div>
          <div className="admin-order-buttons">
            <button type="button" className="admin-secondary" aria-label={`${game.name} 맨 위로`} disabled={pending || index === 0} onClick={() => move(index, 0)}>맨 위로</button>
            <button type="button" className="admin-secondary" aria-label={`${game.name} 위로`} disabled={pending || index === 0} onClick={() => move(index, index - 1)}>↑ 위로</button>
            <button type="button" className="admin-secondary" aria-label={`${game.name} 아래로`} disabled={pending || index === items.length - 1} onClick={() => move(index, index + 1)}>↓ 아래로</button>
          </div>
        </li>;
      })}
    </ol>
    {!items.length && <p className="admin-empty">고정된 신작 게임이 없습니다.</p>}
  </div>;
}
