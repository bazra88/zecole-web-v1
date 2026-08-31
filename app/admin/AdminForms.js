"use client";

import { useActionState } from "react";
import { importGameAction, loginAction } from "./actions";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="admin-login-form">
      <label htmlFor="admin-password">관리자 비밀번호</label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" required autoFocus />
      {state?.error ? <p className="admin-message error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "확인 중…" : "로그인"}</button>
    </form>
  );
}

export function AdminImportForm() {
  const [state, action, pending] = useActionState(importGameAction, {});
  return (
    <form action={action} className="admin-import-form">
      <label htmlFor="meta-store-url">Meta 스토어 게임 링크</label>
      <div>
        <input id="meta-store-url" name="meta_store_url" type="url" placeholder="https://www.meta.com/ko-kr/experiences/게임명/상품번호/" required />
        <button type="submit" disabled={pending}>{pending ? "스토어 확인 중…" : "게임 등록"}</button>
      </div>
      <small>게임명, 이미지, 가격, 출시일, 평점 등은 Meta 상세 페이지에서 자동으로 가져옵니다.</small>
      {state?.error ? <p className="admin-message error">{state.error}</p> : null}
      {state?.success ? <p className="admin-message success">{state.success}</p> : null}
    </form>
  );
}
