import Link from "next/link";
import SaleCountdown from "@/components/SaleCountdown";
import { gameImageUrl } from "@/lib/supabase";
import {
  discountedPriceLabel,
  discountSavingsLabel,
  effectiveAffiliateDiscount,
  formatGamePrice,
  isFreeGame,
  motionSicknessLabel,
  reviewLabel,
} from "@/lib/game-format";

function genreHue(name) {
  return [...name].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 360, 210);
}

export default function GameCard({ game, usdKrwRate = null, catalogStatus = null, horizonPlusGameIds = null }) {
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
  const MAX_VISIBLE_GENRES = 2;
  const visibleGenres = genres.slice(0, MAX_VISIBLE_GENRES);
  const hiddenGenreCount = genres.length - visibleGenres.length;
  const motionLabel = motionSicknessLabel(game.motion_sickness_level);
  const curationTag = game.zecole_recommended
    ? "제콜추천"
    : game.beginner_recommended
    ? "초보자"
    : game.advanced_recommended
    ? "숙련자"
    : null;
  const isHorizonPlus = horizonPlusGameIds?.has(game.id);
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
          <>
            <img src={image} alt="" aria-hidden="true" loading="lazy" className="game-thumb-bg" />
            <img src={image} alt={`${game.name} 게임 이미지`} loading="lazy" className="game-thumb-fg" />
          </>
        ) : (
          <div className="no-image">NO IMAGE</div>
        )}

        <div className="badges">
          {catalogStatus === "removed" ? <span className="badge catalog-removed">이번 달 제외</span> : null}
          {free && Number(game.first_iap_discount_percent || 0) > 0 ? (
            <span className="badge iap">
              첫 IAP {Number(game.first_iap_discount_percent)}% 할인
            </span>
          ) : null}
        </div>

        {curationTag ? <span className="badge-curation-ribbon">{curationTag}</span> : null}
        {isHorizonPlus ? <span className="badge-horizon-ribbon">Horizon +</span> : null}
        {affiliateDiscount > 0 ? <span className="badge-discount-ribbon">-{affiliateDiscount}%</span> : null}
        {catalogStatus === "added" ? <span className="badge-new-ribbon">신규</span> : null}
      </Link>

      <div className="game-card-body">
        <Link href={`/games/${game.slug}`} className={`game-title${titleSizeClass}`}>
          {game.name}
        </Link>

        <div className="game-tags-wrap" tabIndex={hiddenGenreCount > 0 ? 0 : undefined}>
          <div className="game-tags" aria-label={genres.length ? "장르" : undefined}>
            {visibleGenres.map((genre) => (
              <span key={genre} className="game-genre" style={{ "--genre-hue": genreHue(genre) }}>{genre}</span>
            ))}
            {motionLabel ? <span className="tag-motion">멀미 {motionLabel}</span> : null}
            {hiddenGenreCount > 0 ? <span className="tag-more">+{hiddenGenreCount}</span> : null}
          </div>
          {hiddenGenreCount > 0 ? (
            <div className="game-tags-overlay">
              {genres.map((genre) => (
                <span key={genre} className="game-genre" style={{ "--genre-hue": genreHue(genre) }}>{genre}</span>
              ))}
              {motionLabel ? <span className="tag-motion">멀미 {motionLabel}</span> : null}
            </div>
          ) : null}
        </div>

        {timedStoreOffer || price.regional ? (
          <div className="game-note-row">
            {timedStoreOffer ? <SaleCountdown endsAt={game.meta_store_offer_ends_at} /> : null}
            {price.regional ? <span className="game-price-region">한국 스토어 미판매</span> : null}
          </div>
        ) : null}

        <div className="game-price-row">
          <div className="game-meta">
            {game.rating ? (
              <span className="game-rating">
                <b aria-hidden="true">★</b> {Number(game.rating).toFixed(1)}
              </span>
            ) : null}
            {reviews ? <span className="game-reviews">{game.rating ? `· ${reviews}` : reviews}</span> : null}
          </div>

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
          </div>
        </div>
      </div>
    </article>
  );
}
