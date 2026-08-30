import Link from "next/link";
import { gameImageUrl } from "@/lib/supabase";
import {
  discountedPriceLabel,
  effectiveAffiliateDiscount,
  formatGamePrice,
  isFreeGame,
  reviewLabel,
} from "@/lib/game-format";

function genreHue(name) {
  return [...name].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 360, 210);
}

export default function GameCard({ game }) {
  const image = gameImageUrl(game.image_path || game.source_image_url);
  const price = formatGamePrice(game);
  const free = isFreeGame(game);
  const discount = effectiveAffiliateDiscount(game);
  const affiliateDiscount = !free && game.affiliate_url ? discount.percent || 10 : discount.percent;
  const discountedPrice = affiliateDiscount > 0
    ? discountedPriceLabel(game, affiliateDiscount)
    : null;
  const reviews = reviewLabel(game.review_count);
  const genres = [...new Set(
    (game.game_genres || [])
      .map((link) => link.genres?.name)
      .filter(Boolean)
  )];

  return (
    <article className="game-card">
      <Link href={`/games/${game.slug}`} className="game-thumb">
        {image ? (
          <img src={image} alt={`${game.name} 게임 이미지`} loading="lazy" />
        ) : (
          <div className="no-image">NO IMAGE</div>
        )}

        <div className="badges">
          {free ? <span className="badge free">무료</span> : null}
          {!free && affiliateDiscount > 0 ? (
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
        <Link href={`/games/${game.slug}`} className="game-title">
          {game.name}
        </Link>

        {(game.rating || reviews || game.motion_sickness_level) ? (
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
        ) : null}

        {genres.length ? (
          <div className="game-genres" aria-label="장르">
            {genres.map((genre) => (
              <span key={genre} style={{ "--genre-hue": genreHue(genre) }}>{genre}</span>
            ))}
          </div>
        ) : null}

        <div className="game-price">
          {discountedPrice ? (
            <div className="game-card-prices">
              <span>{price.primary}</span>
              <strong>{discountedPrice}</strong>
            </div>
          ) : (
            <div>
              <strong>{price.primary}</strong>
            </div>
          )}
          {price.secondary ? <span>{price.secondary}</span> : null}
        </div>

        {price.regional ? (
          <p className="region-note">한국 스토어 미판매 · 환산 가격 참고</p>
        ) : null}

      </div>
    </article>
  );
}
