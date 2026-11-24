import { cardPriceDisplay } from "./game-format.js";

// ZECOLE VR 런처가 읽는 공개 응답 형식(version 1).
// 필드 이름은 런처와 맞춘 약속이므로 바꾸지 않는다. 값이 없으면 null.
// 관리자 순서·숨김 여부·내부 ID·할인 정책 원값 같은 DB 내부 값은 넣지 않는다.
export const SITE_URL = "https://zecole.store";
export const LAUNCHER_FEED_VERSION = 1;
export const LAUNCHER_NEW_GAMES_LIMIT = 8;
export const NEW_RELEASES_LIST_URL = `${SITE_URL}/games?sort=release_desc`;

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function countNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

// 카드 화면과 같은 가격 표기를 만든다(GameCardContent와 같은 cardPriceDisplay 사용).
// - Meta 자체 할인 중: 할인가 / 정상가 / Meta 할인율
// - 제휴 할인: 제휴 할인가 / 스토어 가격 / 제휴 할인율
// - 가격을 모르는 게임(화면의 "가격 확인")은 priceLabel을 null로 둔다.
// - 쿠폰 행사(결제 시 코드 입력)는 넣지 않는다. 약속한 필드에 "코드 필요"를 알릴 칸이 없어
//   런처에 실제 판매가처럼 보이기 때문이다. 쿠폰 대상이어도 쿠폰이 없는 것처럼 계산한다.
export function launcherPrice(game, now = new Date()) {
  const { storeSale, affiliateDiscount, price, discountedPrice } = cardPriceDisplay(withoutStoreCoupon(game), null, now);
  const known = price.primary !== "가격 확인";
  if (storeSale) {
    return { priceLabel: price.primary, originalPriceLabel: storeSale.originalLabel, discountPercent: storeSale.percent };
  }
  if (discountedPrice) {
    return { priceLabel: discountedPrice, originalPriceLabel: price.primary, discountPercent: affiliateDiscount };
  }
  return { priceLabel: known ? price.primary : null, originalPriceLabel: null, discountPercent: null };
}

function withoutStoreCoupon(game) {
  if (!game?.store_coupon) return game;
  const { store_coupon: _coupon, ...rest } = game;
  return rest;
}

export function launcherGameItem(game, { imageUrl, now = new Date() }) {
  const free = cardPriceDisplay(game, null, now).free;
  return {
    name: game.name ?? null,
    slug: game.slug ?? null,
    url: game.slug ? `${SITE_URL}/games/${encodeURIComponent(game.slug)}` : null,
    image: imageUrl(game.image_path || game.source_image_url) || null,
    releaseDate: game.release_date || null,
    pricing: free ? "free" : "paid",
    ...launcherPrice(game, now),
    rating: positiveNumber(game.rating),
    reviewCount: countNumber(game.review_count),
  };
}

export function launcherNewGamesPayload(games, { imageUrl, now = new Date() }) {
  return {
    version: LAUNCHER_FEED_VERSION,
    updatedAt: now.toISOString(),
    listUrl: NEW_RELEASES_LIST_URL,
    items: games
      .filter((game) => game?.slug)
      .slice(0, LAUNCHER_NEW_GAMES_LIMIT)
      .map((game) => launcherGameItem(game, { imageUrl, now })),
  };
}
