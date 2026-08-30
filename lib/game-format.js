export function isFreeGame(game) {
  return game?.pricing_type === "free" || game?.pricing_type === "free_to_play";
}

export function effectiveAffiliateDiscount(game, now = new Date()) {
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
  if (Number.isFinite(usd) && usd >= 0) {
    return { amount: usd, currency: "USD" };
  }

  if (currentCurrency === "USD" && Number.isFinite(current) && current >= 0) {
    return { amount: current, currency: "USD" };
  }

  // Legacy rows used current_price as USD before separate currency columns existed.
  if (!currentCurrency && Number.isFinite(current) && current >= 0) {
    return { amount: current, currency: "USD" };
  }

  return null;
}

export function formatGamePrice(game) {
  if (isFreeGame(game)) {
    return { primary: "무료", secondary: null, regional: false };
  }

  const storePrice = preferredStorePrice(game);
  if (storePrice?.currency === "KRW") {
    return {
      primary: `${Math.round(storePrice.amount).toLocaleString("ko-KR")}원`,
      secondary: null,
      regional: false,
    };
  }

  if (storePrice?.currency === "USD") {
    const converted = Number(game?.krw_converted_price);
    return {
      primary: `$${storePrice.amount.toFixed(2)}`,
      secondary:
        Number.isFinite(converted) && converted > 0
          ? `약 ${Math.round(converted).toLocaleString("ko-KR")}원`
          : null,
      regional: Boolean(game?.region_restricted),
    };
  }

  return { primary: "가격 확인", secondary: null, regional: false };
}

export function discountedPriceLabel(game, percent) {
  const multiplier = 1 - Number(percent || 0) / 100;
  const storePrice = preferredStorePrice(game);
  if (storePrice?.currency === "KRW") {
    return `${Math.round(storePrice.amount * multiplier).toLocaleString("ko-KR")}원`;
  }

  return storePrice?.currency === "USD"
    ? `$${(storePrice.amount * multiplier).toFixed(2)}`
    : null;
}

export function reviewLabel(count) {
  if (count === null || count === undefined) return null;
  const n = Number(count);
  if (!Number.isFinite(n)) return null;
  return `리뷰 ${n.toLocaleString("ko-KR")}`;
}
