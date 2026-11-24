export function isFreeGame(game) {
  return game?.pricing_type === "free" || game?.pricing_type === "free_to_play";
}

// meta_store_original_price는 메타 스토어 자체 할인(strikethrough_price)이 있을 때만 채워진다
// (lib/meta-collect.mjs의 extractOfferPricing 참고). 메타가 이미 할인 중인 가격에 우리 제휴
// 10% 할인을 또 얹으면 실제로 적용 불가능한 이중할인을 표시하게 되므로, 이 경우엔 제휴
// 할인을 아예 끄고 메타 스토어가 보여주는 할인가를 그대로 보여준다(2026-09-23, 사용자 요청 —
// Meta Connect 세일로 다수 게임이 실제로 이 상태가 됨).
export function storeDiscountInfo(game, now = new Date()) {
  const original = Number(game?.meta_store_original_price);
  const price = displayedStorePrice(game, now);
  if (!price || !Number.isFinite(original) || original <= price.amount || original <= 0) return null;
  return {
    percent: Math.round((1 - price.amount / original) * 100),
    originalLabel: price.currency === 'KRW' ? `￦${Math.round(original).toLocaleString('ko-KR')}` : `$${original.toFixed(2)}`,
  };
}

// Meta 스토어 쿠폰 행사(예: 블프 "BF2026 코드로 40% 할인"). 스토어 가격은 그대로이고 결제할 때
// 코드를 넣어야 할인되므로 가격 DB·가격 이력은 건드리지 않고, 서버가 붙인 game.store_coupon
// (lib/store-coupons.js)으로 화면에서만 계산한다. 쿠폰 코드와 제휴 프로모션 코드는 한 결제에
// 같이 쓸 수 없으므로 쿠폰 기간에는 제휴 10%를 끈다. Meta 자체 할인 중인 게임에는 쿠폰가를
// 얹지 않는다(겹치는지 확인되지 않음). 종료 시각이 지나면 자동으로 원래 표시로 돌아간다.
export function storeCouponInfo(game, now = new Date()) {
  const coupon = game?.store_coupon;
  if (!coupon || isFreeGame(game)) return null;
  const percent = Number(coupon.percent);
  const end = Date.parse(coupon.ends_at);
  const start = coupon.starts_at ? Date.parse(coupon.starts_at) : null;
  const time = Number(now);
  if (!(percent > 0 && percent < 100) || !coupon.code || !Number.isFinite(end) || time >= end) return null;
  if (start != null && (!Number.isFinite(start) || time < start)) return null;
  if (storeDiscountInfo(game, now)) return null;
  const price = displayedStorePrice(game, now);
  if (!price || !(price.amount > 0)) return null;
  // 대상 여부를 확인한 지역 통화와 지금 표시 통화가 다르면(예: 미국 목록에서 확인 후 한국 가격이 생김) 표시하지 않는다.
  if (coupon.currency && coupon.currency !== price.currency) return null;
  return { code: String(coupon.code), percent, endsAt: coupon.ends_at, endLabel: coupon.end_label || null };
}

export function displayedDiscountPercent(game, now = new Date()) {
  const sale = storeDiscountInfo(game, now);
  if (sale) return sale.percent;
  const coupon = storeCouponInfo(game, now);
  if (coupon) return coupon.percent;
  if (isFreeGame(game)) return 0;
  const discount = effectiveAffiliateDiscount(game, now).percent;
  return game?.affiliate_url ? discount || 10 : discount;
}

export function effectiveAffiliateDiscount(game, now = new Date()) {
  if (storeDiscountInfo(game, now)) {
    return { percent: 0, promotional: false, label: null, storeDiscounted: true };
  }
  if (storeCouponInfo(game, now)) {
    return { percent: 0, promotional: false, label: null, storeDiscounted: true, coupon: true };
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

function observedStorePrice(game) {
  const krw = Number(game?.krw_price);
  if (game?.krw_price != null && Number.isFinite(krw) && krw >= 0) {
    return { amount: krw, currency: "KRW" };
  }

  const current = Number(game?.current_price);
  const currentCurrency = String(game?.currency || "").toUpperCase();
  if (game?.current_price != null && currentCurrency === "KRW" && Number.isFinite(current) && current >= 0) {
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

// Expiry is a display fallback, not a new store observation. Keep DB/history intact.
export function storeOfferExpired(game, now = new Date()) {
  const end = Date.parse(game?.meta_store_offer_ends_at);
  const original = Number(game?.meta_store_original_price);
  const price = observedStorePrice(game);
  return !isFreeGame(game) && Number.isFinite(end) && end <= Number(now)
    && !!price && Number.isFinite(original) && original > price.amount;
}

export function displayedStorePrice(game, now = new Date()) {
  const price = observedStorePrice(game);
  return storeOfferExpired(game, now)
    ? { ...price, amount: Number(game.meta_store_original_price) }
    : price;
}

export function formatGamePrice(game, usdKrwRate = null, discountPercent = 0, now = new Date()) {
  if (isFreeGame(game)) {
    return { primary: "무료", secondary: null, regional: false };
  }

  const storePrice = displayedStorePrice(game, now);
  if (storePrice?.currency === "KRW") {
    return {
      primary: `￦${Math.round(storePrice.amount).toLocaleString("ko-KR")}`,
      secondary: null,
      regional: false,
    };
  }

  if (storePrice?.currency === "USD") {
    const liveRate = Number(usdKrwRate);
    const observed = observedStorePrice(game);
    const storedConversion = storeOfferExpired(game, now)
      ? (observed.amount > 0 ? Number(game?.krw_converted_price) * storePrice.amount / observed.amount : NaN)
      : Number(game?.krw_converted_price);
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

export function discountedPriceLabel(game, percent, now = new Date()) {
  const multiplier = 1 - Number(percent || 0) / 100;
  const storePrice = displayedStorePrice(game, now);
  if (storePrice?.currency === "KRW") {
    return `￦${Math.round(storePrice.amount * multiplier).toLocaleString("ko-KR")}`;
  }

  return storePrice?.currency === "USD"
    ? `$${(storePrice.amount * multiplier).toFixed(2)}`
    : null;
}

export function discountSavingsLabel(game, percent, now = new Date()) {
  const rate = Number(percent || 0) / 100;
  const storePrice = displayedStorePrice(game, now);
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

// 게임 카드에 보이는 가격 묶음. 카드 화면과 런처용 공개 주소가 같은 값을 쓰도록 한 곳에서 계산한다.
// Meta 자체 할인·쿠폰 행사 중에는 제휴 할인을 겹치지 않는다(storeDiscountInfo, storeCouponInfo 참고).
export function cardPriceDisplay(game, usdKrwRate = null, now = new Date()) {
  const free = isFreeGame(game);
  const discount = effectiveAffiliateDiscount(game, now);
  const storeSale = storeDiscountInfo(game, now);
  const coupon = storeCouponInfo(game, now);
  const affiliateDiscount = discount.storeDiscounted
    ? 0
    : !free && game?.affiliate_url ? discount.percent || 10 : discount.percent;
  const price = formatGamePrice(game, usdKrwRate, coupon ? coupon.percent : affiliateDiscount, now);
  const discountedPrice = affiliateDiscount > 0
    ? discountedPriceLabel(game, affiliateDiscount, now)
    : null;
  const couponPrice = coupon ? discountedPriceLabel(game, coupon.percent, now) : null;
  return { free, storeSale, coupon, couponPrice, affiliateDiscount, price, discountedPrice };
}

// 카드·상세의 시계(useSaleClock)에 넘길 가격 변경 시각들(Meta 할인 종료, 쿠폰 종료).
// 지난 시각도 넣어야 캐시된 페이지가 열릴 때 끝난 할인을 바로 지운다. 문자열이라 렌더마다 같은 값.
export function priceChangeTimes(game) {
  const times = [game?.meta_store_offer_ends_at, game?.store_coupon?.ends_at]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .map((time) => new Date(time).toISOString());
  return times.length ? [...new Set(times)].join("|") : null;
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
