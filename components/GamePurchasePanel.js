"use client";
import { discountedPriceLabel, effectiveAffiliateDiscount, formatGamePrice, isFreeGame, storeDiscountInfo, storeOfferExpired } from "@/lib/game-format";
import { useSaleClock } from "@/components/useSaleClock";

export default function GamePurchasePanel({ game, renderedAt }) {
  const now = useSaleClock(game.meta_store_offer_ends_at, renderedAt);
  const free = isFreeGame(game);
  const discount = effectiveAffiliateDiscount(game, now);
  const storeSale = storeDiscountInfo(game, now);
  const affiliateDiscount = discount.storeDiscounted
    ? 0
    : !free && game.affiliate_url ? discount.percent || 10 : discount.percent;
  const discountedPrice = affiliateDiscount > 0 ? discountedPriceLabel(game, affiliateDiscount, now) : null;
  const price = formatGamePrice(game, null, affiliateDiscount, now);
  return (
        <div className="detail-info">
          <p className="eyebrow">META QUEST GAME</p>
          <h1>{game.name}</h1>

          <div className="detail-badges">
            {storeSale ? <span className="badge sale">Meta 스토어 {storeSale.percent}% 할인</span> : null}
            {!free && affiliateDiscount > 0 ? (
              <span className={`badge ${discount.promotional ? "promo" : "sale"}`}>
                {affiliateDiscount}% 할인
              </span>
            ) : null}
            {game.krw_store_available === false || game.region_restricted ? (
              <span className="badge region">한국 스토어 미출시</span>
            ) : game.krw_store_available == null ? (
              <span className="badge">한국 스토어 확인 전</span>
            ) : null}
          </div>

          <div className="detail-price">
            <div className="detail-price-line">
              {storeSale ? (
                <div className="detail-affiliate-prices">
                  <span className="detail-original-price">{storeSale.originalLabel}</span>
                  <strong className="detail-discount-price">{price.primary}</strong>
                </div>
              ) : discountedPrice ? (
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
            {storeOfferExpired(game, now) ? <small>할인 종료 · 저장된 정상가 기준 (구매 시 최종 가격 확인)</small> : null}
            {game.price_checked_at ? <small>가격 확인: {new Date(game.price_checked_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)</small> : null}
            {game.krw_store_available === false || game.region_restricted ? <small>한국 스토어에서는 구매할 수 없는 상품입니다. 구입 시 VPN 사용이 필요합니다.</small> : null}
          </div>

          {game.affiliate_url || game.meta_store_url ? (
            <a
              className="primary-button detail-buy"
              href={storeSale ? game.meta_store_url || `https://www.meta.com/experiences/${String(game.meta_product_id).split('_').pop()}/` : game.affiliate_url || game.meta_store_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              {free
                ? "다운로드"
                : affiliateDiscount > 0
                ? "구매하기"
                : "구매하기"}
            </a>
          ) : null}

          {free ? (
            <p className="affiliate-benefit">
              <strong>제휴 혜택이 자동 적용됩니다.</strong>
              <span>첫 번째 인앱 결제 시 50% 할인 적용</span>
            </p>
          ) : null}

          {storeSale ? <p className="affiliate-note">Meta 스토어 자체 할인 가격입니다. 제휴 링크 및 프로모션 코드 10% 할인은 중복 적용되지 않습니다.</p> : !free ? (
            <p className="affiliate-note">
              제휴 혜택은 Meta의 적용 조건과 프로모션 기간에 따라 달라질 수 있습니다.
              <span>수익금의 일부가 제휴회원에게 지급되며 구매자가 부담하는 금액은 전혀 없습니다.</span>
            </p>
          ) : null}
        </div>
  );
}
