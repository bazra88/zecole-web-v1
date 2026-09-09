import Link from "next/link";

export default function HomeHero() {
  return (
    <section className="hero-band hero-band-bleed">
      <div className="hero-bleed-row">
        <div className="hero-text-col">
          <p className="eyebrow">VR 입문 가이드</p>
          <h1 className="hero-headline">
            VR을 시작한다면,
            <br />
            Meta Quest 3 / 3S
          </h1>
          <p className="hero-lede">
            제콜스토어가 추천하는 게임과 가이드는 대부분 Quest 3 / 3S 기준입니다.
          </p>

          <div className="hero-benefits">
            <div className="hero-benefit">
              <div className="hero-benefit-value">₩36,000</div>
              <div className="hero-benefit-label">제휴 구매 시 지급되는 퀘스트 캐시</div>
            </div>
            <div className="hero-benefit">
              <div className="hero-benefit-value">30일</div>
              <div className="hero-benefit-label">공식 스토어 무료 체험 · 무료 반품</div>
            </div>
          </div>

          <div className="quest-promo-row hero-promo-row">
            <span className="quest-promo-code">
              <b>ZECOLE</b>
              <span>프로모션 코드</span>
            </span>
            <span className="hero-promo-note">게임 구매 시 함께 입력해 주세요 (대소문자 구분 없음)</span>
          </div>

          <Link href="/quest" className="hero-cta">
            Meta Quest 3 / 3S 살펴보기 →
          </Link>
        </div>

        <div className="hero-bleed-image-col">
          <img
            src="/hero/quest-lifestyle-wide.webp"
            alt="Meta Quest 3 / 3S 헤드셋과 컨트롤러가 놓인 거실"
            className="hero-bleed-image"
          />
          <div className="hero-bleed-fade" />
          <Link href="/rayban-meta" className="hero-inset">
            <img
              src="/hero/rayban-meta-glasses.webp"
              alt="Ray-Ban Meta 스마트 안경"
              className="hero-inset-swatch"
            />
            <div>
              <div className="hero-inset-eyebrow">Ai 스마트 안경은 어떠세요?</div>
              <div className="hero-inset-title">Ray-Ban Meta 보기 →</div>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
