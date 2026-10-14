// Only public display fields cross the client boundary.
export function purchaseGame(game) {
  return Object.fromEntries(['name', 'pricing_type', 'krw_price', 'usd_price', 'current_price', 'currency', 'meta_store_original_price', 'meta_store_offer_ends_at', 'krw_converted_price', 'region_restricted', 'krw_store_available', 'base_affiliate_discount_percent', 'affiliate_discount_percent', 'promo_affiliate_discount_percent', 'promo_starts_at', 'promo_ends_at', 'promo_label', 'affiliate_url', 'meta_store_url', 'meta_product_id', 'rating', 'review_count', 'price_checked_at'].map(key => [key, game[key] ?? null]));
}
