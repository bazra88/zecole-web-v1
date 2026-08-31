import Link from "next/link";
import SaleCountdown from "@/components/SaleCountdown";
import { gameImageUrl } from "@/lib/supabase";
import {
  discountedPriceLabel,
  discountSavingsLabel,
  effectiveAffiliateDiscount,
  formatGamePrice,
  isFreeGame,
  reviewLabel,
} from "@/lib/game-format";

function genreHue(name) {
  return [...name].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 360, 210);
}

export default function GameCard({ game, usdKrwRate = null, catalogStatus = null }) {
  const image = gameImageUrl(game.image_path || game.source_image_url);
  const free = isFreeGame(game);
  const discount = effectiveAffiliateDiscount(game);
  const affiliateDiscount = !free && game.affiliate_url ? discount.percent || 10 : discount.percent;
  const price = formatGamePrice(game, usdKrwRate, affiliateDiscount);
  const discountedPrice = affiliateDiscount > 0
    ? discountedPriceLabel(game, affiliateDiscount)
    : null;
  const discountSavings = affiliateDiscount > 0
    ? discountSavingsLabel(game, affiliateDiscount)
    : null;
  const reviews = reviewLabel(game.review_count);
  const genres = [...new Set(
    (game.game_genres || [])
      .map((link) => link.genres?.name)
      .filter(Boolean)
  )];
  const timedStoreOffer = game.meta_store_show_timer && game.meta_store_offer_ends_at;
  const titleLength = [...game.name].length;
  const titleSizeClass = titleLength > 38
    ? " game-title-extra-compact"
    : titleLength > 23
    ? " game-title-compact"
    : "";

  return (
    <article className="game-card">
      <Link href={`/games/${game.slug}`} className="game-thumb">
        {image ? (
          <img src={image} alt={`${game.name} 게임 이미지`} loading="lazy" />
        ) : (
          <div className="no-image">NO IMAGE</div>
        )}

        <div className="badges">
          {catalogStatus === "added" ? <span className="badge catalog-added">이번 달 추가</span> : null}
          {catalogStatus === "removed" ? <span className="badge catalog-removed">이번 달 제외</span> : null}
          {false && free ? <span className="badge free">무료</span> : null}
          {false && !free && affiliateDiscount > 0 ? (
            <span className={`badge ${discount.promotional ? "promo" : "sale"}`}>
              {discount.promotional ? "기간한정 " : ""}
              {affiliateDiscount}% 할인
            </span>
          ) : null}
          {free && Number(game.first_iap_discount_percent || 0) > 0 ? (
            <span className="badge iap">
              첫 IAP {Number(game.first_iap_discount_percent)}% 할인
            </span>
          ) : null}
        </div>
      </Link>

      <div className="game-card-body">
        <Link href={`/games/${game.slug}`} className={`game-title${titleSizeClass}`}>
          {game.name}
        </Link>

        <div className="game-meta">
          {game.rating ? (
            <span className="game-rating">
              <b aria-hidden="true">★</b> {Number(game.rating).toFixed(1)}
            </span>
          ) : null}
          {reviews ? <span className="game-reviews">{reviews}</span> : null}
          {game.motion_sickness_level ? (
            <span>멀미 {game.motion_sickness_level}/5</span>
          ) : null}
        </div>

        <div className="game-genres" aria-label={genres.length ? "장르" : undefined}>
          {genres.map((genre) => (
            <span key={genre} style={{ "--genre-hue": genreHue(genre) }}>{genre}</span>
          ))}
        </div>

        <div className="game-price">
          {discountedPrice ? (
            <div className="game-card-prices">
              <span>{price.primary}</span>
              <strong>{discountedPrice}</strong>
              {affiliateDiscount > 0 ? <em className="game-discount-savings">-{affiliateDiscount}% 할인</em> : null}
            </div>
          ) : (
            <div>
              <strong>{price.primary}</strong>
            </div>
          )}
          {price.secondary ? (
            <div className="game-price-side">
              <span className="game-secondary-price">{price.secondary}</span>
            </div>
          ) : null}
        </div>

        <div className={`region-note${timedStoreOffer || price.regional ? "" : " is-empty"}`} aria-hidden={!timedStoreOffer && !price.regional}>
          {timedStoreOffer ? (
            <SaleCountdown endsAt={game.meta_store_offer_ends_at} />
          ) : price.regional ? (
            "한국 스토어 미판매 · 환산 가격 참고"
          ) : (
            "가격 지역 안내 없음"
          )}
        </div>

      </div>
    </article>
  );
}
