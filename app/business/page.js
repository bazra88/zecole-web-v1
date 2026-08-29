import SectionHeader from "@/components/SectionHeader";

export default function BusinessPage() {
  return (
    <main className="container page narrow">
      <SectionHeader
        eyebrow="BUSINESS INQUIRY"
        title="비즈니스 문의"
        description="광고, 스폰서십, 게임/제품 리뷰, 협업, 행사 및 취재 제안을 받습니다."
      />

      <div className="business-tags">
        <span>광고 / 스폰서십</span>
        <span>게임 리뷰</span>
        <span>제품 리뷰</span>
        <span>협업 / 제휴</span>
        <span>행사 / 취재</span>
      </div>

      <div className="business-form">
        <label>회사 / 브랜드<input placeholder="회사명 또는 브랜드명" /></label>
        <label>담당자명<input placeholder="담당자명" /></label>
        <label>이메일<input type="email" placeholder="contact@example.com" /></label>
        <label>
          문의 유형
          <select defaultValue="">
            <option value="" disabled>선택해주세요</option>
            <option>광고 / 스폰서십</option>
            <option>게임 리뷰</option>
            <option>제품 리뷰</option>
            <option>협업 / 제휴</option>
            <option>행사 / 취재</option>
            <option>기타</option>
          </select>
        </label>
        <label>제목<input placeholder="문의 제목" /></label>
        <label>내용<textarea rows="8" placeholder="제안 내용을 자세히 적어주세요." /></label>
        <label>관련 링크<input placeholder="제품 페이지, 보도자료, 영상 등" /></label>
        <button type="button" className="primary-button">문의 보내기</button>
        <p className="form-note">
          새 프론트 v1에서는 UI만 구성했습니다. 실제 저장은 스팸 방지와
          개인정보 처리 문구를 정한 후 안전하게 연결합니다.
        </p>
      </div>
    </main>
  );
}
