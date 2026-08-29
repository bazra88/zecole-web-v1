import SectionHeader from "@/components/SectionHeader";

export default function Page() {
  return (
    <main className="container page">
      <SectionHeader
        eyebrow="VR NEWS"
        title="VR 업계 최신 뉴스"
        description="Meta와 VR 업계 주요 소식을 ZECOLE YouTube 콘텐츠와 함께 연결합니다."
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
