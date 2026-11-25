import Link from "next/link";

// 가격·행사·반품 기간은 Meta 공식 스토어(meta.com/kr/ai-glasses) 2026-11-25 확인 기준.
// 행사가 끝나면 아래 시각이 지난 뒤 할인 표시가 자동으로 사라진다(5분 단위로 다시 그림).
export const revalidate = 300;

// 제휴 링크: 받으면 여기에만 넣는다. 비어 있으면 공식 제품 페이지로 연결된다.
// DEFAULT 하나만 넣으면 모든 구매 버튼에 쓰이고, 모델별 값이 있으면 그 값이 먼저다.
const AFFILIATE_LINKS = {
  DEFAULT: null,
  wayfarer2: null,
  skyler2: null,
  headliner2: null,
  wayfarer3: null,
  zena3: null,
  aviator3: null,
};

// 블랙프라이데이 할인: 공식 안내는 "할인은 11월 30일"(시각 미공지) → 한국 시간 11월 30일 끝까지 표시.
const SALE = { percent: 25, endsAt: "2026-11-30T23:59:59+09:00", endLabel: "11월 30일" };
// 연말 반품 기간 연장: 제품 페이지 "2027년 1월 31일까지 무료 반품". 끝나면 평소 30일만 표시.
const EXTENDED_RETURN = { endsAt: "2027-01-31T23:59:59+09:00", label: "2027년 1월 31일" };

const OFFICIAL = "https://www.meta.com/kr/ai-glasses";

const PRODUCTS = [
  {
    key: "wayfarer2", gen: 2, name: "Wayfarer", image: "/rayban/wayfarer2.webp",
    desc: "가장 유명한 Ray-Ban 사각 프레임. 누구에게나 무난한 대표 모델",
    price: 690000, salePrice: 517500,
    url: `${OFFICIAL}/ray-ban-meta-wayfarer-matte-black-clear-gen-2/`,
  },
  {
    key: "skyler2", gen: 2, name: "Skyler", image: "/rayban/skyler2.webp",
    desc: "캣아이 라인의 부드러운 프레임. 작은 얼굴형에 잘 어울려요",
    price: 690000, salePrice: 517500,
    url: `${OFFICIAL}/ray-ban-meta-skyler-shiny-black-green-gen-2/`,
  },
  {
    key: "headliner2", gen: 2, name: "Headliner", image: "/rayban/headliner2.webp",
    desc: "둥근 프레임의 클래식하고 단정한 인상",
    price: 690000, salePrice: 517500,
    url: `${OFFICIAL}/ray-ban-meta-headliner-matte-peach-transitions-gen-2/`,
  },
  {
    key: "wayfarer3", gen: 3, name: "Wayfarer", image: "/rayban/wayfarer3.webp",
    desc: "대표 프레임의 3세대. 더 얇아진 카메라와 최대 9시간 배터리",
    price: 740000, salePrice: null,
    url: `${OFFICIAL}/ray-ban-meta-gen-3-wayfarer-shiny-black-grey-transitions/`,
  },
  {
    key: "zena3", gen: 3, name: "Zena", image: "/rayban/zena3.webp",
    desc: "3세대에서 새로 나온 프레임",
    price: 740000, salePrice: null,
    url: `${OFFICIAL}/ray-ban-meta-gen-3-zena-shiny-black-graphite-green-transitions/`,
  },
  {
    key: "aviator3", gen: 3, name: "Aviator", image: "/rayban/aviator3.webp",
    desc: "Ray-Ban을 상징하는 보잉 프레임을 3세대로",
    price: 740000, salePrice: null,
    url: `${OFFICIAL}/ray-ban-meta-gen-3-aviator-havana-brown-transitions/`,
  },
];

const FEATURES = [
  { icon: "📸", title: "핸즈프리 촬영", body: "12MP 광각 카메라로 사진, 최대 3K 30fps 동영상을 찍어요. 말 한마디나 버튼 한 번이면 돼요." },
  { icon: "🤖", title: "Meta AI에게 바로 질문", body: "눈앞에 보이는 것을 물어보세요. 랜드마크 설명, 레시피, 추천까지 음성으로 답해줘요." },
  { icon: "🌐", title: "실시간 번역", body: "여러 언어로 대화를 실시간 번역해 들려줘요. 해외여행에서 특히 유용해요." },
  { icon: "🎧", title: "오픈 이어 스피커", body: "안경다리 속 스피커로 음악·팟캐스트를 나만 들을 수 있게. 귀를 막지 않아 주변 소리도 들려요." },
  { icon: "📞", title: "통화와 메시지", body: "5개 마이크로 선명한 핸즈프리 통화, 문자·음성 메시지 전송, 영상 통화까지 할 수 있어요." },
  { icon: "👓", title: "도수 렌즈 지원", body: "대부분의 도수 렌즈를 지원해요. 선글라스·Transitions®·클리어 렌즈 중에서 고를 수 있어요." },
];

function won(value) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function buyLink(key, fallback) {
  return AFFILIATE_LINKS[key] || AFFILIATE_LINKS.DEFAULT || fallback;
}

export default function Page() {
  const now = Date.now();
  const saleOn = now < Date.parse(SALE.endsAt);
  const extendedReturn = now < Date.parse(EXTENDED_RETURN.endsAt);
  const hasAffiliate = Object.values(AFFILIATE_LINKS).some(Boolean);
  const lowest = Math.min(...PRODUCTS.map((p) => (saleOn && p.salePrice) || p.price));
  const featured = PRODUCTS[0];

  return (
    <main className="container page quest-guide rbm-guide">
      <div className="quest-hero rbm-hero">
        <div className="rbm-hero-copy">
          <p className="eyebrow">RAY-BAN META</p>
          <h1>Ray-Ban Meta AI 안경</h1>
          <p className="quest-hero-lede">
            사진 찍고, 음악 듣고, 통화하고, AI에게 묻는 것까지.
            <br />
            평소 안경처럼 쓰기만 하면 되는 Meta의 AI 안경이에요.
          </p>
          <div className="quest-hero-benefits">
            {saleOn ? (
              <div className="hero-benefit">
                <div className="hero-benefit-value">{SALE.percent}% 할인</div>
                <div className="hero-benefit-label">{SALE.endLabel}까지 · 2세대 전 모델</div>
              </div>
            ) : (
              <div className="hero-benefit">
                <div className="hero-benefit-value">{won(lowest)}~</div>
                <div className="hero-benefit-label">공식 스토어 시작 가격</div>
              </div>
            )}
            <div className="hero-benefit">
              <div className="hero-benefit-value">{extendedReturn ? "1월 31일까지" : "30일"}</div>
              <div className="hero-benefit-label">
                {extendedReturn ? "연말 연장 무료 반품 (평소 30일)" : "써보고 결정하는 무료 반품"}
              </div>
            </div>
          </div>
        </div>
        <img className="rbm-hero-image" src="/hero/rayban-meta-glasses.webp" alt="Ray-Ban Meta AI 안경" />
      </div>

      {saleOn ? (
        <a className="rbm-sale-band" href={buyLink(featured.key, featured.url)} target="_blank" rel="noopener noreferrer sponsored">
          <span className="rbm-sale-tag">BLACK FRIDAY</span>
          <span className="rbm-sale-text">
            <b>Ray-Ban Meta 2세대 {SALE.percent}% 할인</b>
            <span>
              {won(featured.price)} → <strong>{won(featured.salePrice)}</strong> · {SALE.endLabel}까지, 일 년 중 가장 낮은 가격
            </span>
          </span>
          <span className="quest-arrow">→</span>
        </a>
      ) : null}

      {/* 제품 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>어떤 모델을 고를까?</h2>
          <p className="quest-section-note">
            공식 스토어 가격 기준이며
            <br />
            프레임·렌즈 색상에 따라 달라질 수 있어요
          </p>
        </div>
        {[2, 3].map((gen) => (
          <div key={gen} className="rbm-gen">
            <div className="rbm-gen-head">
              <h3>Ray-Ban Meta (Gen {gen})</h3>
              <span>
                {gen === 2
                  ? saleOn ? `지금 ${SALE.percent}% 할인 중 · 가성비 추천` : "배터리 최대 8시간 · 가성비 추천"
                  : "최신 모델 · 배터리 최대 9시간"}
              </span>
            </div>
            <div className="rbm-product-grid">
              {PRODUCTS.filter((p) => p.gen === gen).map((product) => {
                const onSale = saleOn && product.salePrice;
                return (
                  <a
                    key={product.key}
                    className="rbm-product"
                    href={buyLink(product.key, product.url)}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    <div className="rbm-product-art">
                      <img src={product.image} alt={`Ray-Ban Meta ${product.name} (Gen ${gen})`} loading="lazy" />
                      {onSale ? <span className="rbm-product-badge">-{SALE.percent}%</span> : null}
                    </div>
                    <div className="rbm-product-body">
                      <div className="rbm-product-name">{product.name}</div>
                      <p>{product.desc}</p>
                      <div className="rbm-product-price">
                        {onSale ? (
                          <>
                            <s>{won(product.price)}</s>
                            <strong>{won(product.salePrice)}</strong>
                          </>
                        ) : (
                          <strong>{won(product.price)}</strong>
                        )}
                        <span className="quest-arrow">→</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
        <div className="quest-compare-grid rbm-compare">
          <div className={`quest-compare-card${saleOn ? " recommended" : ""}`}>
            {saleOn ? <span className="quest-compare-badge">할인 중이라 지금 추천</span> : null}
            <div className="quest-compare-name">Gen 2</div>
            <div className="quest-compare-price">
              {saleOn ? won(517500) : won(690000)}
              <small>{saleOn ? `정가 ${won(690000)}` : "공식 스토어 가격"}</small>
            </div>
            <div className="quest-compare-specs">
              <div className="quest-spec-row"><span className="quest-spec-label">카메라</span><span className="quest-spec-value">12MP 광각 · 최대 3K 30fps</span></div>
              <div className="quest-spec-row"><span className="quest-spec-label">배터리</span><span className="quest-spec-value">최대 8시간 (케이스로 +48시간)</span></div>
              <div className="quest-spec-row"><span className="quest-spec-label">마이크</span><span className="quest-spec-value">5개</span></div>
            </div>
            <p className="quest-compare-for"><b>추천 대상 —</b> 합리적인 가격으로 AI 안경을 시작하고 싶은 분</p>
          </div>
          <div className="quest-compare-card">
            <div className="quest-compare-name">Gen 3</div>
            <div className="quest-compare-price">
              {won(740000)}
              <small>최신 모델</small>
            </div>
            <div className="quest-compare-specs">
              <div className="quest-spec-row"><span className="quest-spec-label">카메라</span><span className="quest-spec-value">더 얇아지고 개선된 3K 카메라</span></div>
              <div className="quest-spec-row"><span className="quest-spec-label">배터리</span><span className="quest-spec-value">최대 9시간</span></div>
              <div className="quest-spec-row"><span className="quest-spec-label">프레임</span><span className="quest-spec-value">Wayfarer · Zena · Aviator</span></div>
            </div>
            <p className="quest-compare-for"><b>추천 대상 —</b> 최신 디자인과 더 긴 사용 시간을 원하는 분</p>
          </div>
        </div>
      </section>

      {/* 기능 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>안경 하나로 할 수 있는 것들</h2>
        </div>
        <div className="rbm-feature-grid">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rbm-feature">
              <span className="rbm-feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
        <p className="quest-compare-footnote">
          * 사진·영상을 찍는 동안에는 안경 앞의 촬영 LED가 켜져 주변 사람이 알 수 있어요. LED가 가려지면 카메라가
          작동하지 않아요. 안경을 쓰려면 휴대폰에 Meta AI 앱이 필요해요.
        </p>
      </section>

      {/* 반품 */}
      <section className="quest-section">
        <div className="quest-section-head">
          <h2>직접 써보고 결정하세요</h2>
        </div>
        <div className="quest-benefit-band">
          <div className="quest-benefit-band-copy">
            <h3>마음에 안 들면 무료로 반품할 수 있어요</h3>
            <p>
              공식 스토어에서 산 제품은 평소에도 받은 뒤 30일 안에 무료로 반품할 수 있어요.
              {extendedReturn
                ? ` 지금은 연말 이벤트로 반품 기간이 늘어나 ${EXTENDED_RETURN.label}까지 무료 반품이 가능해요. 선물로 사도 여유 있게 써보고 결정할 수 있어요.`
                : " 직접 써보고 나와 맞는지 확인한 뒤 결정하세요."}
            </p>
          </div>
          <div className="quest-benefit-boxes">
            <div className="quest-benefit-box">
              <div className="hero-benefit-value">30일</div>
              <div className="hero-benefit-label">평소 무료 반품 기간</div>
            </div>
            {extendedReturn ? (
              <div className="quest-benefit-box">
                <div className="hero-benefit-value">1월 31일</div>
                <div className="hero-benefit-label">연말 연장 반품 기한</div>
              </div>
            ) : null}
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
              <h3>아래 버튼으로 공식 스토어 이동</h3>
              <p>마음에 드는 모델을 눌러 Meta 공식 스토어 상품 페이지로 이동해요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">2</div>
            <div>
              <h3>프레임·렌즈·사이즈 선택</h3>
              <p>프레임 색상, 렌즈(선글라스·Transitions®·클리어), 사이즈를 고르세요. &quot;가상으로 착용해보기&quot;로 얼굴에 맞는지 먼저 볼 수 있어요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">3</div>
            <div>
              <h3>장바구니에 담고 결제</h3>
              <p>{saleOn ? `${SALE.endLabel}까지는 할인가가 자동으로 적용돼요. ` : ""}무료 배송이며, 예상 배송일은 상품 페이지에서 확인할 수 있어요.</p>
            </div>
          </div>
          <div className="quest-step">
            <div className="quest-step-num">4</div>
            <div>
              <h3>Meta AI 앱과 연결</h3>
              <p>받은 안경을 휴대폰 Meta AI 앱에 연결하면 바로 쓸 수 있어요.</p>
            </div>
          </div>
        </div>
        <div className="quest-buy-buttons">
          {PRODUCTS.filter((p) => p.key === "wayfarer2" || p.key === "wayfarer3").map((product) => (
            <a
              key={product.key}
              className="quest-buy-btn"
              href={buyLink(product.key, product.url)}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <span>
                Ray-Ban Meta Gen {product.gen} 구매하기
                <span className="quest-buy-btn-price">
                  {saleOn && product.salePrice ? `${won(product.salePrice)} (${SALE.percent}% 할인)` : won(product.price)}
                </span>
              </span>
              <span className="quest-arrow">→</span>
            </a>
          ))}
        </div>
        <div className="quest-buy-notes">
          {hasAffiliate ? (
            <p className="quest-buy-note-highlight">
              * 위 버튼은 제콜스토어 제휴 링크예요. 제휴링크로 구매하시면 판매금의 일부가 제콜스토어에 후원돼요.
              후원금은 전액 메타에서 부담하니 걱정하지 마세요. 감사합니다.
            </p>
          ) : null}
          <p className="quest-buy-note">* 가격과 행사 내용은 조사 시점 기준이며, 최종 가격은 결제 화면에서 확인해 주세요.</p>
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
            <div className="quest-faq-q"><span className="quest-q-mark">Q.</span>Gen 2와 Gen 3, 뭘 사야 할까요?</div>
            <p className="quest-faq-a">
              {saleOn
                ? `지금은 Gen 2가 ${SALE.percent}% 할인 중이라 가격 대비 가장 좋아요. 최신 디자인과 더 긴 배터리(최대 9시간)가 중요하다면 Gen 3를 추천해요.`
                : "가격이 중요하다면 Gen 2, 최신 디자인과 더 긴 배터리(최대 9시간)가 중요하다면 Gen 3를 추천해요."}
            </p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q"><span className="quest-q-mark">Q.</span>안경 도수를 넣을 수 있나요?</div>
            <p className="quest-faq-a">대부분의 도수 렌즈를 지원해요. 다만 도수 렌즈 제작 가능 여부는 매장마다 다를 수 있어요.</p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q"><span className="quest-q-mark">Q.</span>반품은 어떻게 하나요?</div>
            <p className="quest-faq-a">
              평소에는 받은 뒤 30일 안에 공식 스토어에서 무료로 반품을 신청할 수 있어요.
              {extendedReturn ? <><br />지금 구매하면 연말 연장 혜택으로 {EXTENDED_RETURN.label}까지 반품할 수 있어요.</> : null}
            </p>
          </div>
          <div className="quest-faq-item">
            <div className="quest-faq-q"><span className="quest-q-mark">Q.</span>휴대폰 없이도 쓸 수 있나요?</div>
            <p className="quest-faq-a">처음 설정, 사진·영상 옮기기, Meta AI 사용에는 휴대폰의 Meta AI 앱이 필요해요.</p>
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
