export default function GameLoadingOverlay() {
  return (
    <div className="game-loading-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className="game-loading-panel">
        <span className="game-loading-spinner" aria-hidden="true" />
        <strong>게임 정보를 불러오고 있어요</strong>
        <p>이미지와 상세 정보를 준비하고 있습니다.<br />처음 여는 게임은 조금 더 걸릴 수 있어요.</p>
      </div>
    </div>
  );
}
