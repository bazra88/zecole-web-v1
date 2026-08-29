import SectionHeader from "@/components/SectionHeader";

export default function Page() {
  return (
    <main className="container page">
      <SectionHeader
        eyebrow="META QUEST"
        title="Meta Quest 구매 가이드"
        description="Quest 3 / 3S 비교, 36,000원 상당 스토어 캐시 혜택과 구매 정보를 정리합니다."
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
