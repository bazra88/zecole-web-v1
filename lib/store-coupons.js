// Meta 스토어 쿠폰 행사 대상 게임을 서버에서 게임 행에 붙인다(game.store_coupon).
// 대상 목록은 행사 목록 페이지에서 수집해 사이트 게임 ID로 연결한 정적 데이터다
// (scripts/build-store-coupon-data.mjs). DB에는 쓰지 않으며, 가격 계산은 lib/game-format.js의
// storeCouponInfo가 맡는다. 새 행사를 추가하면 CAMPAIGNS 배열에 넣는다.
import bf2026 from "./store-coupon-data/bf2026.js";

const CAMPAIGNS = [bf2026];

// 전체 VR 게임 페이지 "가격" 필터에 보일 이름(행사 이름 → 필터 이름).
const FILTER_LABELS = { bf2026: "블프 할인" };

// 지금 진행 중인 쿠폰 행사의 필터 항목. 행사가 없거나 끝났으면 null(필터 항목도 숨김).
export function activeStoreCouponFilter(now = new Date()) {
  const time = Number(now);
  const campaign = CAMPAIGNS.find((item) =>
    Date.parse(item.ends_at) > time && !(item.starts_at && Date.parse(item.starts_at) > time));
  if (!campaign) return null;
  return { value: "coupon", label: FILTER_LABELS[campaign.name] || `${campaign.code} 쿠폰 할인` };
}

const couponByGameId = new Map();
for (const campaign of CAMPAIGNS) {
  // 통화는 대상 여부를 확인한 스토어 지역(KRW=한국 목록, USD=미국 목록).
  for (const [currency, ids] of Object.entries(campaign.game_ids_by_currency || {})) {
    const coupon = Object.freeze({
      code: campaign.code,
      percent: campaign.percent,
      currency,
      starts_at: campaign.starts_at || null,
      ends_at: campaign.ends_at,
      end_label: campaign.end_label || null,
    });
    for (const id of ids) couponByGameId.set(id, coupon);
  }
}

export function storeCouponForGame(gameId, now = new Date()) {
  const coupon = couponByGameId.get(gameId);
  if (!coupon || !(Date.parse(coupon.ends_at) > Number(now))) return null;
  return coupon;
}

export function attachStoreCoupon(game, now = new Date()) {
  if (!game || typeof game !== "object" || !game.id) return game;
  const coupon = storeCouponForGame(game.id, now);
  return coupon ? { ...game, store_coupon: coupon } : game;
}

export function attachStoreCoupons(rows, now = new Date()) {
  return Array.isArray(rows) ? rows.map((row) => attachStoreCoupon(row, now)) : rows;
}
