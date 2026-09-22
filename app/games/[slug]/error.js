"use client";

export default function GameDetailError({ reset }) {
  return (
    <main className="container page">
      <div className="error-panel" role="alert">
        <h1>게임 정보를 불러오지 못했어요</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button type="button" onClick={reset}>다시 시도</button>
        <p><a href="/games">게임 목록으로 돌아가기</a></p>
      </div>
    </main>
  );
}
