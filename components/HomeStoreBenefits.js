"use client";

import Link from "next/link";
import { useState } from "react";

// 메인 히어로 아래 "Meta 스토어 제휴 혜택" 안내.
// 유료 게임: 결제 시 프로모션 코드 ZECOLE → 10% 할인
// 무료 게임: 제콜스토어 제휴 링크(게임 상세의 다운로드 버튼)로 받으면 첫 인앱 결제(DLC 포함) 50% 할인
const PROMO_CODE = "ZECOLE";

export default function HomeStoreBenefits() {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="container store-benefits" aria-labelledby="store-benefits-title">
      <div className="store-benefits-head">
        <p className="eyebrow">ZECOLE 제휴 혜택</p>
        <h2 id="store-benefits-title">Meta 스토어에서 게임을 살 때, 이렇게 아끼세요</h2>
      </div>
      <div className="store-benefits-grid">
        <div className="store-benefit-card">
          <div className="store-benefit-kind">유료 게임</div>
          <div className="store-benefit-value">10% 할인</div>
          <p>Meta 스토어 결제 화면에서 프로모션 코드를 입력하세요.</p>
          <button type="button" className="store-benefit-code" onClick={copyCode} aria-label={`프로모션 코드 ${PROMO_CODE} 복사`}>
            <code>{PROMO_CODE}</code>
            <span>{copied ? "복사됨" : "코드 복사"}</span>
          </button>
          <small>대소문자 구분 없음 · 다른 할인 코드와 중복 적용되지 않아요</small>
        </div>
        <div className="store-benefit-card">
          <div className="store-benefit-kind">무료 게임</div>
          <div className="store-benefit-value">첫 인앱 결제 50% 할인</div>
          <p>
            무료 게임은 할인할 금액이 없는 대신, 제콜스토어 링크로 받으면 <b>첫 번째 인앱 결제(DLC 포함)</b>가
            50% 할인돼요.
          </p>
          <Link href="/games?pricing=free" className="store-benefit-link">
            무료 게임 둘러보기 →
          </Link>
          <small>게임 페이지의 &quot;다운로드&quot; 버튼이 제휴 링크예요</small>
        </div>
      </div>
    </section>
  );
}
