"use client";

import { useActionState, useState } from "react";
import { deleteGameAction, setGameNewReleasePinnedAction, setGameVisibilityAction, updateAffiliateUrlAction } from "./actions";

function AffiliateEditor({ game }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateAffiliateUrlAction, null);

  if (!editing) {
    return (
      <button className={game.affiliate_url ? "admin-affiliate-edit" : "admin-affiliate-add"} type="button" onClick={() => setEditing(true)}>
        {game.affiliate_url ? "제휴 링크 수정" : "제휴 링크 추가"}
      </button>
    );
  }

  return (
    <form action={action} className="admin-affiliate-form">
      <input type="hidden" name="id" value={game.id} />
      <input type="hidden" name="slug" value={game.slug} />
      <input
        aria-label={`${game.name} 제휴 링크`}
        name="affiliate_url"
        type="url"
        inputMode="url"
        defaultValue={game.affiliate_url || ""}
        placeholder="https://... (비우면 제거)"
        autoFocus
      />
      <button className="admin-affiliate-save" type="submit" disabled={pending}>{pending ? "저장 중" : "저장"}</button>
      <button className="admin-cancel" type="button" onClick={() => setEditing(false)}>취소</button>
      {state?.error ? <span className="admin-affiliate-message error">{state.error}</span> : null}
      {state?.success ? <span className="admin-affiliate-message success">{state.success}</span> : null}
    </form>
  );
}

export default function AdminGameControls({ game }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="admin-game-controls">
      <AffiliateEditor game={game} />

      <form action={setGameNewReleasePinnedAction}>
        <input type="hidden" name="id" value={game.id} />
        <input type="hidden" name="pinned" value={game.admin_new_release_pinned ? "false" : "true"} />
        <button className={game.admin_new_release_pinned ? "admin-pinned" : "admin-pin"} type="submit">
          {game.admin_new_release_pinned ? "신규 고정 해제" : "신규에 고정"}
        </button>
      </form>

      <form action={setGameVisibilityAction}>
        <input type="hidden" name="id" value={game.id} />
        <input type="hidden" name="hidden" value={game.admin_hidden ? "false" : "true"} />
        <button className={game.admin_hidden ? "admin-restore" : "admin-danger"} type="submit">
          {game.admin_hidden ? "복구" : "숨기기"}
        </button>
      </form>

      {confirmingDelete ? (
        <div className="admin-delete-confirm">
          <span>정말 삭제할까요?</span>
          <form action={deleteGameAction}>
            <input type="hidden" name="id" value={game.id} />
            <button className="admin-delete" type="submit">완전 삭제</button>
          </form>
          <button className="admin-cancel" type="button" onClick={() => setConfirmingDelete(false)}>취소</button>
        </div>
      ) : (
        <button className="admin-delete-trigger" type="button" onClick={() => setConfirmingDelete(true)}>DB 삭제</button>
      )}
    </div>
  );
}
