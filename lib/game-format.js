export function isFreeGame(game) {
  return game?.pricing_type === "free" || game?.pricing_type === "free_to_play";
}

// meta_store_original_price는 메타 스토어 자체 할인(strikethrough_price)이 있을 때만 채워진다
// (lib/meta-collect.mjs의 extractOfferPricing 참고). 메타가 이미 할인 중인 가격에 우리 제휴
// 10% 할인을 또 얹으면 실제로 적용 불가능한 이중할인을 표시하게 되므로, 이 경우엔 제휴
// 할인을 아예 끄고 메타 스토어가 보여주는 할인가를 그대로 보여준다(2026-09-23, 사용자 요청 —
// Meta Connect 세일로 다수 게임이 실제로 이 상태가 됨).
export function storeDiscountInfo(game) {
  const original = Number(game?.meta_store_original_price);
  const price = preferredStorePrice(game);
  if (!price || !Number.isFinite(original) || original <= price.amount || original <= 0) return null;
  return {
    percent: Math.round((1 - price.amount / original) * 100),
    originalLabel: price.currency === 'KRW' ? `￦${Math.round(original).toLocaleString('ko-KR')}` : `$${original.toFixed(2)}`,
  };
}

export function effectiveAffiliateDiscount(game, now = new Date()) {
  if (storeDiscountInfo(game)) {
    return { percent: 0, promotional: false, label: null, storeDiscounted: true };
  }

  const promo = Number(game?.promo_affiliate_discount_percent || 0);
  const base = Number(
    game?.base_affiliate_discount_percent ||
      game?.affiliate_discount_percent ||
      0
  );

  if (promo > 0) {
    const starts = game?.promo_starts_at
      ? new Date(game.promo_starts_at)
      : null;
    const ends = game?.promo_ends_at ? new Date(game.promo_ends_at) : null;
    const active =
      (!starts || now >= starts) &&
      (!ends || now <= ends);

    if (active) {
      return { percent: promo, promotional: true, label: game?.promo_label };
    }
  }

  if (base > 0) {
    return { percent: base, promotional: false, label: null };
  }

  return { percent: 0, promotional: false, label: null };
}

function preferredStorePrice(game) {
  const krw = Number(game?.krw_price);
  if (Number.isFinite(krw) && krw > 0) {
    return { amount: krw, currency: "KRW" };
  }

  const current = Number(game?.current_price);
  const currentCurrency = String(game?.currency || "").toUpperCase();
  if (currentCurrency === "KRW" && Number.isFinite(current) && current > 0) {
    return { amount: current, currency: "KRW" };
  }

  const usd = Number(game?.usd_price);
  if (game?.usd_price != null && Number.isFinite(usd) && usd >= 0) {
    return { amount: usd, currency: "USD" };
  }

  if (game?.current_price != null && currentCurrency === "USD" && Number.isFinite(current) && current >= 0) {
    return { amount: current, currency: "USD" };
  }

  // Legacy rows used current_price as USD before separate currency columns existed.
  if (game?.current_price != null && !currentCurrency && Number.isFinite(current) && current >= 0) {
    return { amount: current, currency: "USD" };
  }

  return null;
}

export function formatGamePrice(game, usdKrwRate = null, discountPercent = 0) {
  if (isFreeGame(game)) {
    return { primary: "무료", secondary: null, regional: false };
  }

  const storePrice = preferredStorePrice(game);
  if (storePrice?.currency === "KRW") {
    return {
      primary: `￦${Math.round(storePrice.amount).toLocaleString("ko-KR")}`,
      secondary: null,
      regional: false,
    };
  }

  if (storePrice?.currency === "USD") {
    const liveRate = Number(usdKrwRate);
    const storedConversion = Number(game?.krw_converted_price);
    const normalizedDiscount = Math.min(100, Math.max(0, Number(discountPercent || 0)));
    const discountMultiplier = 1 - normalizedDiscount / 100;
    const converted = Number.isFinite(liveRate) && liveRate > 0
      ? storePrice.amount * discountMultiplier * liveRate
      : storedConversion * discountMultiplier;
    return {
      primary: `$${storePrice.amount.toFixed(2)}`,
      secondary:
        Number.isFinite(converted) && converted > 0
          ? `약 ￦${Math.round(converted).toLocaleString("ko-KR")}`
          : null,
      regional: Boolean(game?.region_restricted || game?.krw_store_available === false),
    };
  }

  return { primary: "가격 확인", secondary: null, regional: false };
}

export function discountedPriceLabel(game, percent) {
  const multiplier = 1 - Number(percent || 0) / 100;
  const storePrice = preferredStorePrice(game);
  if (storePrice?.currency === "KRW") {
    return `￦${Math.round(storePrice.amount * multiplier).toLocaleString("ko-KR")}`;
  }

  return storePrice?.currency === "USD"
    ? `$${(storePrice.amount * multiplier).toFixed(2)}`
    : null;
}

export function discountSavingsLabel(game, percent) {
  const rate = Number(percent || 0) / 100;
  const storePrice = preferredStorePrice(game);
  if (!storePrice || rate <= 0) return null;

  if (storePrice.currency === "KRW") {
    const discounted = Math.round(storePrice.amount * (1 - rate));
    const savings = Math.max(0, Math.round(storePrice.amount) - discounted);
    return `(-￦${savings.toLocaleString("ko-KR")})`;
  }

  return storePrice.currency === "USD"
    ? `(-$${(storePrice.amount * rate).toFixed(2)})`
    : null;
}

export function reviewLabel(count) {
  if (count === null || count === undefined) return null;
  const n = Number(count);
  if (!Number.isFinite(n)) return null;
  return `리뷰 ${n.toLocaleString("ko-KR")}`;
}

// games.motion_sickness_level은 실제로 1/3/5 세 값만 채워진다(메타 comfort_rating이
// COMFORTABLE_FOR_MOST/SOME/FEW 세 단계뿐이라서) — 5단계 라벨을 쓰면 2·4는 항상 빈다.
const MOTION_SICKNESS_LABELS = { 1: "약함", 3: "보통", 5: "강함" };

export function motionSicknessLabel(level) {
  return MOTION_SICKNESS_LABELS[level] || null;
}
