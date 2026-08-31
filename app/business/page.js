"use client";

import SectionHeader from "@/components/SectionHeader";

export default function BusinessPage() {
  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const subject = formData.get("subject") || "사이트 문의";
    const body = [
      `성함 / 닉네임: ${formData.get("name") || ""}`,
      `이메일: ${formData.get("email") || ""}`,
      `문의 유형: ${formData.get("type") || ""}`,
      "",
      formData.get("message") || "",
    ].join("\n");

    window.location.href = `mailto:zecole.official@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <main className="container page narrow">
      <SectionHeader
        eyebrow="BUSINESS INQUIRY"
        title="비즈니스 및 사이트 문의"
        description="사이트에 요청하실 부분이나, 비즈니스 관련 문의 모두 환영합니다."
      />

      <form className="business-form" onSubmit={handleSubmit}>
        <label>성함 / 닉네임<input name="name" placeholder="성함 또는 닉네임" required /></label>
        <label>이메일<input name="email" type="email" placeholder="contact@example.com" required /></label>
        <label>
          문의 유형
          <select name="type" defaultValue="" required>
            <option value="" disabled>선택해주세요</option>
            <option>광고 / 스폰서십</option>
            <option>게임 리뷰</option>
            <option>제품 리뷰</option>
            <option>협업 / 제휴</option>
            <option>행사 / 취재</option>
            <option>기타</option>
          </select>
        </label>
        <label>제목<input name="subject" placeholder="문의 제목" required /></label>
        <label>내용<textarea name="message" rows="8" placeholder="문의 내용을 자세히 적어주세요." required /></label>
        <button type="submit" className="primary-button">문의 보내기</button>
      </form>
    </main>
  );
}
