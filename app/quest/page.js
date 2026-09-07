import Link from "next/link";
import AutoplayVideo from "@/components/AutoplayVideo";

const AFFILIATE_LINKS = {
  quest3: "https://metacreator.pxf.io/9VrR7e",
  quest3s128: "https://metacreator.pxf.io/rEBZmG",
  quest3s256: "https://metacreator.pxf.io/gReZ6v",
};

export default function Page() {
  return (
    <main className="container page quest-guide">
      <div className="quest-hero">
        <p className="eyebrow">META QUEST</p>
        <h1>Meta Quest 구매 가이드</h1>
        <p className="quest-hero-lede">
          Quest 3와 Quest 3S, 무엇이 다르고 어떤 걸 사야 할지
          <br />
          스펙·가격부터 제휴 혜택까지 한번에 정리했어요.
        </p>
        <div className="quest-hero-benefits">
          <div className="hero-benefit">
            <div className="hero-benefit-value">₩36,000</div>
            <div className="hero-benefit-label">제휴 구매 시 지급되는 퀘스트 캐시</div>
          </div>
          <div className="hero-benefit">
            <div className="hero-benefit-value">30일</div>
            <div className="hero-benefit-label">공식 스토어 무료 체험 · 무료 반품</div>
          </div>
        </div>
      </div>

      {/* 비교 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>Quest 3 vs Quest 3S, 뭐가 다를까?</h2>
          <p className="quest-section-note">
            2026년 4월 가격 인상 반영 기준
            <br />
            실제 가격은 프로모션에 따라 다를 수 있어요
          </p>
        </div>
        <div className="quest-compare-grid">
          <div className="quest-compare-card recommended">
            <span className="quest-compare-badge">화질·MR 중시라면 추천</span>
            <div className="quest-compare-name">Meta Quest 3</div>
            <div className="quest-compare-price">
              ₩957,000
              <small>512GB 단일 구성</small>
            </div>
            <div className="quest-compare-specs">
              <div className="quest-spec-row">
                <span className="quest-spec-label">디스플레이</span>
                <span className="quest-spec-value">2064×2208 (한쪽 눈당)</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">렌즈</span>
                <span className="quest-spec-value">팬케이크</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">시야각</span>
                <span className="quest-spec-value">110° × 96°</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">프로세서</span>
                <span className="quest-spec-value">Snapdragon XR2 Gen 2</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">IPD 조절방식</span>
                <span className="quest-spec-value">58mm ~ 70mm까지 1mm 단위 조절가능</span>
              </div>
            </div>
            <p className="quest-compare-for">
              <b>추천 대상 —</b> 선명한 화질과 넓은 시야각, 혼합현실(MR)까지 제대로 즐기고 싶은 분
            </p>
            <AutoplayVideo
              className="quest-lens-demo"
              src="/quest/quest3-lens.mp4"
              ariaLabel="Quest 3 팬케이크 렌즈, 중심에서 벗어나도 비교적 선명하게 유지되는 모습"
            />
            <p className="quest-lens-caption">중심에서 벗어나도 급격히 흐려지지 않음 (팬케이크 렌즈 특징)</p>
          </div>
          <div className="quest-compare-card">
            <div className="quest-compare-name">Meta Quest 3S</div>
            <div className="quest-compare-price">
              ₩550,000
              <small>128GB · 256GB 약 ₩715,000</small>
            </div>
            <div className="quest-compare-specs">
              <div className="quest-spec-row">
                <span className="quest-spec-label">디스플레이</span>
                <span className="quest-spec-value">1832×1920 (한쪽 눈당)</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">렌즈</span>
                <span className="quest-spec-value">프레넬</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">시야각</span>
                <span className="quest-spec-value">96° × 90°</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">프로세서</span>
                <span className="quest-spec-value">Snapdragon XR2 Gen 2</span>
              </div>
              <div className="quest-spec-row">
                <span className="quest-spec-label">IPD 조절방식</span>
                <span className="quest-spec-value">3단계로 고정된 조절방식</span>
              </div>
            </div>
            <p className="quest-compare-for">
              <b>추천 대상 —</b> 부담 없이 VR을 처음 시작하고 싶은 분
            </p>
            <AutoplayVideo
              className="quest-lens-demo"
              src="/quest/quest3s-lens.mp4"
              ariaLabel="Quest 3S 프레넬 렌즈, 중심에서 벗어나면 급격히 흐려지는 모습"
            />
            <p className="quest-lens-caption">렌즈 중심에서 벗어나면 급격히 흐려짐 (프레넬 렌즈 특징)</p>
          </div>
        </div>
        <p className="quest-compare-footnote">
          * Quest 3는 Quest 3S에 비해서 약 30% 더 선명한 해상도를 가지고 있습니다. 또한 고스트 현상이 적고, 압도적으로
          넓은 아이박스을 가진 팬케이크 렌즈를 사용하여 초점이 잘 흐려지지 않습니다. 위 비교 영상은 제콜스토어에서
          직접 촬영했어요. 가격/스펙은 조사 시점 기준이며 변경될 수 있습니다.
        </p>
      </section>

      {/* 혜택 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>구매하면 받는 혜택</h2>
        </div>
        <div className="quest-benefit-band">
          <div className="quest-benefit-band-copy">
            <h3>두 가지 혜택이 함께 적용돼요</h3>
            <p>
              퀘스트 캐시는 기기를 배송받아 전원을 켠 뒤, 휴대폰 Meta Horizon 앱에 페어링하면 계정 지갑으로 자동
              지급돼요. 정확한 적용 조건은 구매 시 스토어 안내를 확인해 주세요.
            </p>
          </div>
          <div className="quest-benefit-boxes">
            <div className="quest-benefit-box">
              <div className="hero-benefit-value">₩36,000</div>
              <div className="hero-benefit-label">퀘스트 캐시 적립</div>
            </div>
            <div className="quest-benefit-box">
              <div className="hero-benefit-value">30일</div>
              <div className="hero-benefit-label">무료 체험 · 무료 반품</div>
            </div>
          </div>
        </div>
        <div className="quest-benefit-warning">
          <span className="quest-warn-icon">⚠️</span>
          <div className="quest-benefit-warning-body">
            <div className="quest-benefit-warning-title">디바이스 리퍼럴 전 반드시 확인하세요</div>
            <p>
              제휴 혜택으로 퀘스트 캐시를 받기 전에{" "}
              <b>디바이스 리퍼럴을 시도하시면 제휴 혜택이 사라집니다.</b> 이 경우 <b>복구가 불가능</b>하니, 꼭 제휴
              혜택으로 퀘스트 캐시가 지갑에 지급된 것을 확인하신 후에 기기 초기화 후 디바이스 리퍼럴 절차를
              시작하셔야 합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 구매 방법 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>구매 방법</h2>
        </div>
        <div className="quest-steps">
          <div className="quest-step">
            <div className="quest-step-num">1</div>
            <div>
              <h3>캐시 지급 배너 확인</h3>
              <p>
                상품 페이지 상단에 &quot;Meta Quest 3 헤드셋을 구매하고 활성화하여 ₩36,000 Quest Cash를
                적립하세요&quot; 배너가 떠 있는지 확인해요. 광고차단 프로그램(애드가드/애드블럭 등)이 실행중이면
                제대로 적용이 되지 않아 메세지가 뜨지 않을 수 있어요.
              </p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">2</div>
            <div>
              <h3>아래 제휴 링크로 이동</h3>
              <p>아래 제휴 링크로 공식 스토어에 접속해서 원하는 모델과 용량을 고르고 &quot;장바구니에 담기&quot;를 클릭해요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">3</div>
            <div>
              <h3>장바구니에서 프로모션 코드 추가</h3>
              <p>장바구니 페이지의 &quot;프로모션 코드 추가&quot;를 클릭해요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">4</div>
            <div>
              <h3>코드 입력</h3>
              <p>입력란에 아래 코드를 입력하고 &quot;적용&quot;을 눌러요. (대소문자 구분 없음)</p>
              <div className="quest-promo-row">
                <span className="quest-promo-code">
                  <b>ZECOLE</b>
                  <span>프로모션 코드</span>
                </span>
              </div>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">5</div>
            <div>
              <h3>적용 확인 후 결제</h3>
              <p>주문 요약에 코드가 적용되고 &quot;Quest Cash 30달러&quot;가 포함됐는지 확인한 다음 결제를 진행해요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">6</div>
            <div>
              <h3>캐시 지급 확인</h3>
              <p>배송받은 퀘스트를 휴대폰의 메타 호라이즌 앱에 페어링하여 계정 내 지갑에 퀘스트 캐시가 지급됐는지 확인해요.</p>
            </div>
          </div>
        </div>
        <div className="quest-customs-note">
          <b>해외 직배송 안내 —</b> 이 상품은 해외에서 직접 배송돼요(해외직구 방식). 주문 시{" "}
          <b>개인통관고유부호</b> 입력이 필요할 수 있고, 배송까지 약 1주일 정도 걸려요. 정확한 도착일은 주문 시
          스토어에서 안내되는 예상 배송일을 따라요.
        </div>
        <div className="quest-buy-buttons">
          <a
            className="quest-buy-btn"
            href={AFFILIATE_LINKS.quest3}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            <span>
              Quest 3 구매하기
              <span className="quest-buy-btn-price">512GB ₩957,000</span>
            </span>
            <span className="quest-arrow">→</span>
          </a>
          <a
            className="quest-buy-btn"
            href={AFFILIATE_LINKS.quest3s128}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            <span>
              Quest 3S 구매하기
              <span className="quest-buy-btn-price">128GB ₩550,000</span>
            </span>
            <span className="quest-arrow">→</span>
          </a>
          <a
            className="quest-buy-btn"
            href={AFFILIATE_LINKS.quest3s256}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            <span>
              Quest 3S 구매하기
              <span className="quest-buy-btn-price">256GB ₩715,000</span>
            </span>
            <span className="quest-arrow">→</span>
          </a>
        </div>
        <div className="quest-buy-notes">
          <p className="quest-buy-note">
            * 위 버튼은 제콜스토어 제휴 링크예요. 이 링크로 들어가서 결제 시 프로모션 코드 &quot;ZECOLE&quot;도 함께
            입력해 주세요.
          </p>
          <p className="quest-buy-note-highlight">
            * 제휴링크로 구매 하시면 판매금의 일부가 제콜스토어에 후원되요. 후원금은 전액 메타에서 부담하니 걱정하지
            않으셔도 되요. 감사합니다.
          </p>
          <p className="quest-buy-note">
            * 공식 홈페이지에서 구매 시 카드사에서 별도의 수수료를 추가할 수 있음을 알려드려요. 자세한 수수료는
            카드사에 문의해 주세요.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="quest-section" style={{ marginBottom: 0 }}>
        <div className="quest-section-head">
          <h2>자주 묻는 질문</h2>
        </div>
        <div className="quest-faq-list">
          <div className="quest-faq-item">
            <div className="quest-faq-q">
              <span className="quest-q-mark">Q.</span>Quest 3S와 Quest 3, 뭘 사야 할지 모르겠어요.
            </div>
            <p className="quest-faq-a">
              화질과 넓은 시야각, 혼합현실(MR) 경험이 중요하다면 Quest 3를, 가볍게 VR을 시작해보고 싶다면 Quest
              3S를 추천해요.
            </p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q">
              <span className="quest-q-mark">Q.</span>퀘스트 캐시는 언제, 어떻게 지급되나요?
            </div>
            <p className="quest-faq-a">
              결제만으로는 지급되지 않아요. 기기를 배송받아 전원을 켠 뒤 휴대폰 Meta Horizon 앱에 페어링을 완료하면,
              그 시점에 계정 지갑으로 캐시가 지급돼요.
            </p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q">
              <span className="quest-q-mark">Q.</span>반품은 어떻게 하나요?
            </div>
            <p className="quest-faq-a">
              구매 후 30일 이내라면 공식홈페이지에서 반품신청이 가능하고, 사용하던 제품도 무료로 반품할 수 있어요.
              배송비도 전부 메타에서 부담합니다. 다만 기기에 심각한 훼손이 있는 경우는 제외될 수 있어요.
            </p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q">
              <span className="quest-q-mark">Q.</span>배송은 얼마나 걸리나요?
            </div>
            <p className="quest-faq-a">
              해외에서 직접 배송되는 직구 방식이라 개인통관고유부호가 필요할 수 있고, 약 1주일 정도 소요돼요. 정확한
              도착일은 주문 시 안내되는 예상 배송일을 확인해 주세요.
            </p>
          </div>
        </div>
        <div className="quest-faq-cta">
          <p>
            구매 관련 문의가 있으신가요?
            <span>궁금한 점이 있다면 언제든 편하게 문의해 주세요.</span>
          </p>
          <Link href="/business" className="quest-faq-cta-btn">
            문의하기 →
          </Link>
        </div>
      </section>
    </main>
  );
}
