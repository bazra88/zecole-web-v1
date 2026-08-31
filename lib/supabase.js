const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
}

export function gameImageUrl(path) {
  if (!path) return null;
  if (String(path).startsWith("/") || /^https?:\/\//i.test(String(path))) {
    return String(path);
  }
  const encoded = String(path)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(
    STORAGE_BUCKET
  )}/${encoded}`;
}

export async function restSelect(table, params = {}, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  if (options.count) {
    headers.Prefer = "count=exact";
  }

  const response = await fetch(url.toString(), {
    headers,
    next: { revalidate: options.revalidate ?? 300 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase ${table} 조회 실패 (${response.status}): ${body.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const range = response.headers.get("content-range");
  let count = null;
  if (range && range.includes("/")) {
    const total = range.split("/").pop();
    if (total && total !== "*") count = Number(total);
  }

  return { data, count };
}

export async function getGames({
  limit = 5,
  offset = 0,
  order = "name.asc",
  search = "",
  pricing = "",
  priceRange = "",
  recommendation = "",
  genre = "",
  minReviews = null,
  releasedOnly = false,
  newReleasePinned = null,
  revalidate = 300,
  count = false,
} = {}) {
  const params = {
    select:
      "id,name,slug,affiliate_url,meta_store_url,image_path,source_image_url,current_price,original_price,currency,release_date,created_at,rating,review_count,pricing_type,affiliate_discount_percent,affiliate_discount_active,first_iap_discount_percent,krw_price,usd_price,krw_converted_price,krw_store_available,region_restricted,admin_new_release_pinned,motion_sickness_level,beginner_recommended,advanced_recommended,zecole_recommended,popularity_score,base_affiliate_discount_percent,promo_affiliate_discount_percent,promo_starts_at,promo_ends_at,promo_label,meta_store_original_price,meta_store_offer_ends_at,meta_store_show_timer,game_genres(genres(name,slug))",
    active: "eq.true",
    admin_hidden: "eq.false",
    order,
    limit,
    offset,
  };

  if (search) params.name = `ilike.*${search.replaceAll("*", "")}*`;
  if (pricing === "paid") params.pricing_type = "eq.paid";
  if (pricing === "free") params.pricing_type = "in.(free,free_to_play)";
  if (Number.isFinite(Number(minReviews)) && Number(minReviews) > 0) {
    params.review_count = `gte.${Math.floor(Number(minReviews))}`;
  }
  const priceRanges = {
    under_10000: { krwMin: 1, krwMax: 10000, usdMin: 0.01, usdMax: 7.15 },
    10000_30000: { krwMin: 10000, krwMax: 30000, usdMin: 7.15, usdMax: 21.45 },
    30000_50000: { krwMin: 30000, krwMax: 50000, usdMin: 21.45, usdMax: 35.75 },
    over_50000: { krwMin: 50000, krwMax: null, usdMin: 35.75, usdMax: null },
  };
  const range = priceRanges[priceRange];
  if (range) {
    const krwUpper = range.krwMax ? `,krw_price.lt.${range.krwMax}` : "";
    const usdUpper = range.usdMax ? `,usd_price.lt.${range.usdMax}` : "";
    params.or = `(and(krw_price.gte.${range.krwMin}${krwUpper}),and(krw_price.is.null,usd_price.gte.${range.usdMin}${usdUpper}))`;
  }
  if (recommendation === "beginner") params.beginner_recommended = "eq.true";
  if (recommendation === "advanced") params.advanced_recommended = "eq.true";
  if (recommendation === "zecole") params.zecole_recommended = "eq.true";
  if (typeof newReleasePinned === "boolean") params.admin_new_release_pinned = `eq.${newReleasePinned}`;
  if (genre) {
    const { data: genreRows } = await restSelect("genres", { select: "id", slug: `eq.${genre}`, limit: 1 }, { revalidate });
    const genreId = genreRows?.[0]?.id;
    if (genreId) {
      const { data: links } = await restSelect("game_genres", { select: "game_id", genre_id: `eq.${genreId}`, limit: 10000 }, { revalidate });
      const gameIds = (links || []).map((link) => link.game_id).filter(Boolean);
      params.id = gameIds.length ? `in.(${gameIds.join(",")})` : "in.(00000000-0000-0000-0000-000000000000)";
    } else {
      params.id = "in.(00000000-0000-0000-0000-000000000000)";
    }
  }
  if (releasedOnly) params.release_date = `lte.${new Date().toISOString().slice(0, 10)}`;

  return restSelect("games", params, { count, revalidate });
}

export async function getGenres() {
  const { data } = await restSelect("genres", { select: "id,name,slug", order: "name.asc", limit: 100 }, { revalidate: 300 });
  return data || [];
}

export async function getGameBySlug(slug) {
  const { data } = await restSelect(
    "games",
    {
      select: "*",
      slug: `eq.${slug}`,
      active: "eq.true",
      admin_hidden: "eq.false",
      limit: 1,
    },
    { revalidate: 300 }
  );
  return data?.[0] || null;
}

export async function getGameVideos(gameId) {
  const { data } = await restSelect(
    "game_videos",
    {
      select: "*",
      game_id: `eq.${gameId}`,
      active: "eq.true",
      order: "is_featured.desc,sort_order.asc,published_at.desc.nullslast",
    },
    { revalidate: 300 }
  );
  return data || [];
}

export async function getGameGenres(gameId) {
  const { data: links } = await restSelect(
    "game_genres",
    { select: "genre_id", game_id: `eq.${gameId}`, limit: 100 },
    { revalidate: 300 }
  );
  const genreIds = [...new Set((links || []).map((link) => link.genre_id).filter(Boolean))];
  if (!genreIds.length) return [];

  const { data } = await restSelect(
    "genres",
    { select: "id,name,slug", id: `in.(${genreIds.join(",")})`, order: "name.asc", limit: 100 },
    { revalidate: 300 }
  );
  return data || [];
}

export async function getHorizonPlus() {
  const { data } = await restSelect(
    "horizon_plus_entries",
    {
      select:
        "id,month,category,external_game_name,note,game_id,game:games(id,name,slug,affiliate_url,meta_store_url,image_path,source_image_url,current_price,original_price,currency,release_date,created_at,rating,review_count,pricing_type,affiliate_discount_percent,affiliate_discount_active,first_iap_discount_percent,krw_price,usd_price,krw_converted_price,krw_store_available,region_restricted,admin_hidden,motion_sickness_level,beginner_recommended,advanced_recommended,zecole_recommended,popularity_score,base_affiliate_discount_percent,promo_affiliate_discount_percent,promo_starts_at,promo_ends_at,promo_label,meta_store_original_price,meta_store_offer_ends_at,meta_store_show_timer,game_genres(genres(name,slug)))",
      order: "month.desc,id.asc",
    },
    { revalidate: 0 }
  );
  return (data || []).filter((entry) => !entry.game?.admin_hidden);
}

export async function getContent(type, limit = 6) {
  const { data } = await restSelect(
    "content_items",
    {
      select:
        "id,title,slug,content_type,summary,thumbnail_url,youtube_video_id,youtube_url,published_at,featured",
      active: "eq.true",
      content_type: type ? `eq.${type}` : undefined,
      order: "featured.desc,published_at.desc.nullslast,created_at.desc",
      limit,
    },
    { revalidate: 300 }
  );
  return data || [];
}
