import SectionHeader from "@/components/SectionHeader";

export default function Page() {
  return (
    <main className="container page">
      <SectionHeader
        eyebrow="YOUTUBE"
        title="ZECOLE 영상"
        description="게임 플레이, 신규 게임 소개, VR 뉴스와 제품 리뷰를 사이트 데이터와 연결합니다."
      />
      <div className="feature-panel">
        <strong>페이지 구조 준비 완료</strong>
        <p>
          현재는 실제 데이터를 넣기 전의 기본 페이지입니다. 다음 단계에서
          해당 카테고리 데이터를 채우면 카드와 콘텐츠가 자동 표시되도록
          확장합니다.
        </p>
      </div>
    </main>
  );
}
