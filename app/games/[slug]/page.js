import Link from "next/link";
import { notFound } from "next/navigation";
import { discountedPriceLabel, effectiveAffiliateDiscount, formatGamePrice, isFreeGame } from "@/lib/game-format";
import { gameImageUrl, getGameBySlug, getGameVideos } from "@/lib/supabase";

export const revalidate = 300;

function dateLabel(value) {
  if (!value) return "정보 준비중";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function supportLabels(game) {
  return [game.supports_quest_3s && "Quest 3S", game.supports_quest_3 && "Quest 3", game.supports_quest_2 && "Quest 2"].filter(Boolean);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  if (!game) return { title: "게임을 찾을 수 없습니다" };
  return {
    title: game.name,
    description:
      game.description ||
      `${game.name}의 Meta Quest 게임 정보와 ZECOLE 제휴 구매 링크를 확인하세요.`,
  };
}

export default async function GameDetailPage({ params }) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  if (!game) notFound();

  const videos = await getGameVideos(game.id).catch(() => []);
  const image = gameImageUrl(game.image_path);
  const price = formatGamePrice(game);
  const free = isFreeGame(game);
  const discount = effectiveAffiliateDiscount(game);
  const affiliateDiscount = !free && game.affiliate_url ? discount.percent || 10 : discount.percent;
  const discountedPrice = affiliateDiscount > 0 ? discountedPriceLabel(game, affiliateDiscount) : null;
  const supports = supportLabels(game);

  return (
    <main className="container detail-page">
      <Link href="/games" className="back-link"><span aria-hidden="true">←</span> 뒤로가기</Link>

      <section className="detail-hero">
        <div className="detail-image">
          {image ? <img src={image} alt={game.name} /> : <div className="no-image">NO IMAGE</div>}
        </div>

        <div className="detail-info">
          <p className="eyebrow">META QUEST GAME</p>
          <h1>{game.name}</h1>

          <div className="detail-badges">
            {!free && affiliateDiscount > 0 ? (
              <span className={`badge ${discount.promotional ? "promo" : "sale"}`}>
                {affiliateDiscount}% 할인
              </span>
            ) : null}
            {game.region_restricted ? (
              <span className="badge region">한국 지역 제한</span>
            ) : null}
          </div>

          <div className="detail-price">
            <div className="detail-price-line">
              {discountedPrice ? (
                <div className="detail-affiliate-prices">
                  <span className="detail-original-price">{price.primary}</span>
                  <strong className="detail-discount-price">{discountedPrice}</strong>
                </div>
              ) : (
                <strong>{price.primary}</strong>
              )}
              {game.rating ? (
                <span className="detail-rating"><b aria-hidden="true">★</b> {Number(game.rating).toFixed(1)}{game.review_count != null ? ` · 리뷰 ${Number(game.review_count).toLocaleString("ko-KR")}개` : ""}</span>
              ) : null}
            </div>
            {price.secondary ? <span>{price.secondary}</span> : null}
            {game.region_restricted ? <small>한국 스토어에서는 구매할 수 없는 상품입니다.</small> : null}
          </div>

          {game.affiliate_url || game.meta_store_url ? (
            <a
              className="primary-button detail-buy"
              href={game.affiliate_url || game.meta_store_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              {free
                ? "다운로드"
                : affiliateDiscount > 0
                ? `${affiliateDiscount}% 할인받고 구매하기`
                : "ZECOLE 링크로 구매하기"}
            </a>
          ) : null}

          {free ? (
            <p className="affiliate-benefit">
              <strong>제휴 혜택이 자동 적용됩니다.</strong>
              <span>첫 번째 인앱 결제 시 50% 할인 적용</span>
            </p>
          ) : null}

          {!free ? (
            <p className="affiliate-note">
              제휴 혜택은 Meta의 적용 조건과 프로모션 기간에 따라 달라질 수 있습니다.
              <span>수익금의 일부가 제휴회원에게 지급되며 구매자가 부담하는 금액은 전혀 없습니다.</span>
            </p>
          ) : null}
        </div>
      </section>

      <section className="detail-overview">
        <div className="detail-description">
          <p className="eyebrow">ABOUT THIS GAME</p>
          <h2>게임 정보</h2>
          <p>{game.description || "공식 게임 소개를 준비하고 있습니다. Meta Store 원본 페이지에서 최신 정보를 먼저 확인할 수 있습니다."}</p>
        </div>
        <aside className="detail-facts">
          <div><span>출시일</span><strong>{dateLabel(game.release_date)}</strong></div>
          <div><span>한국 스토어</span><strong>{game.region_restricted ? "지역 제한" : game.krw_store_available === false ? "확인 필요" : "이용 가능"}</strong></div>
          <div><span>개발사</span><strong>{game.developer || game.publisher || "정보 준비중"}</strong></div>
          <div><span>지원 기기</span><strong>{supports.length ? supports.join(" · ") : "정보 준비중"}</strong></div>
          <div><span>플레이 방식</span><strong>{[game.seated_supported && "좌식", game.standing_supported && "입식"].filter(Boolean).join(" · ") || "정보 준비중"}</strong></div>
          <div><span>멀미 난이도</span><strong>{game.motion_sickness_level ? `${game.motion_sickness_level}/5` : "정보 준비중"}</strong></div>
        </aside>
      </section>

      <section className="detail-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">ZECOLE VIDEO</p>
            <h2>플레이 영상</h2>
          </div>
        </div>

        {videos.length ? (
          <div className="video-grid">
            {videos.map((video) => (
              <a
                key={video.id}
                href={video.youtube_url || `https://www.youtube.com/watch?v=${video.youtube_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" /> : null}
                <strong>{video.title || "ZECOLE 플레이 영상"}</strong>
                <span>YouTube에서 보기 →</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <div className="empty-dot" />
            <div>
              <strong>아직 연결된 ZECOLE 영상이 없습니다.</strong>
              <p>나중에 게임별 YouTube 영상을 연결하면 여기에 자동으로 표시됩니다.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
