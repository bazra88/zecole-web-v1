"use client";

import { useState } from "react";
import { deleteGameAction, setGameNewReleasePinnedAction, setGameVisibilityAction } from "./actions";

export default function AdminGameControls({ game }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="admin-game-controls">
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
