"use client";

import SectionHeader from "@/components/SectionHeader";
import { useState } from "react";

export default function BusinessPage() {
  const [status, setStatus] = useState({ type: "idle", message: "" });

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus({ type: "sending", message: "문의를 전송하고 있습니다." });
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/business-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "문의 전송에 실패했습니다.");

      event.currentTarget.reset();
      setStatus({ type: "success", message: "문의가 정상적으로 전송되었습니다." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "문의 전송에 실패했습니다." });
    }
  }

  return (
    <main className="container page narrow">
      <SectionHeader
        eyebrow="BUSINESS INQUIRY"
        title="비즈니스 및 사이트 문의"
        description="사이트에 요청하실 부분이나, 비즈니스 관련 문의 모두 환영합니다."
      />

      <form className="business-form" onSubmit={handleSubmit}>
        <input className="inquiry-honeypot" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" />
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
        <button type="submit" className="primary-button" disabled={status.type === "sending"}>
          {status.type === "sending" ? "전송 중..." : "문의 보내기"}
        </button>
        {status.message ? <p className={`inquiry-status ${status.type}`}>{status.message}</p> : null}
      </form>
    </main>
  );
}
