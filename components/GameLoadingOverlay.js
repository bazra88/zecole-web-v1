const messages = {
  loading: ['게임 정보를 불러오고 있어요', '이미지와 상세 정보를 준비하고 있습니다. 처음 여는 게임은 조금 더 걸릴 수 있어요.'],
  checking: ['가격과 게임 정보를 확인하고 있어요', '최신 가격과 미디어를 확인하고 있습니다. 확인이 끝나면 자동으로 표시됩니다.'],
  waiting: ['갱신 순서를 기다리고 있어요', '잠시 후 자동으로 다시 확인합니다. 확인이 끝나면 게임 정보를 표시합니다.'],
  updating: ['갱신된 정보를 표시하고 있어요', '확인한 가격과 게임 정보를 화면에 반영하고 있습니다.'],
};

export default function GameLoadingOverlay({phase = 'loading'}) {
  const [title, description] = messages[phase] || messages.loading;
  return (
    <div className="game-loading-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className="game-loading-panel">
        <span className="game-loading-spinner" aria-hidden="true" />
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
