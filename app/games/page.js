import GameCard from "@/components/GameCard";
import GameFilters from "@/components/GameFilters";
import SectionHeader from "@/components/SectionHeader";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { getGames, getGenres } from "@/lib/supabase";

export const revalidate = 300;

const PAGE_SIZES = [24, 48, 100];

const SORTS = {
  name: "name.asc",
  price_asc: "krw_price.asc.nullslast,current_price.asc.nullslast,name.asc",
  price_desc: "krw_price.desc.nullslast,current_price.desc.nullslast,name.asc",
  release_desc: "release_date.desc.nullslast,name.asc",
  release_asc: "release_date.asc.nullslast,name.asc",
  discount:
    "promo_affiliate_discount_percent.desc.nullslast,base_affiliate_discount_percent.desc.nullslast,name.asc",
  reviews: "review_count.desc.nullslast,name.asc",
  rating: "rating.desc.nullslast,review_count.desc.nullslast,name.asc",
};

function queryString(params, overrides = {}) {
  const next = new URLSearchParams();
  const merged = { ...params, ...overrides };

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") {
      next.set(key, String(value));
    }
  }
  return `?${next.toString()}`;
}

function paginationItems(current, total) {
  if (total <= 10) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(current - 4, total - 9));
  const end = Math.min(total, start + 9);
  const sorted = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const items = [];
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }
  sorted.forEach((value, index) => {
    items.push(value);
  });
  if (end < total) {
    if (end < total - 1) items.push("ellipsis");
    items.push(total);
  }
  return items;
}

export default async function GamesPage({ searchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const sort = params.sort || "release_desc";
  const pricing = params.pricing || "";
  const priceRange = params.price_range || "";
  const recommendation = params.recommend || "";
  const minReviews = Math.max(0, Number(params.min_reviews || 0) || 0);
  const genre = params.genre || "";
  const search = (params.q || "").trim();
  const requestedPageSize = Number(params.page_size || 24);
  const pageSize = PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : 24;

  let result = { data: [], count: 0 };
  const [genres, usdKrwRate] = await Promise.all([getGenres(), getUsdKrwRate()]);
  let error = null;

  try {
    result = await getGames({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: SORTS[sort] || SORTS.name,
      search,
      pricing,
      priceRange,
      recommendation,
      minReviews,
      genre,
      count: true,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const games = result.data || [];
  const total = result.count ?? games.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="container page">
      <SectionHeader
        eyebrow="VR GAME DATABASE"
        title="전체 VR 게임"
        titleHref="/games"
        description={`${total.toLocaleString("ko-KR")}개 게임 · 검색, 가격, 출시일, 할인율, 리뷰 수 정렬`}
      />

      <GameFilters
        search={search}
        pricing={pricing}
        priceRange={priceRange}
        recommendation={recommendation}
        genre={genre}
        genres={genres}
        sort={sort}
        pageSize={pageSize}
      />

      {error ? (
        <div className="error-panel">
          <strong>게임 데이터를 불러오지 못했습니다.</strong>
          <p>{error}</p>
        </div>
      ) : games.length ? (
        <div className="game-grid listing">
          {games.map((game) => (
            <GameCard key={game.id} game={game} usdKrwRate={usdKrwRate} />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <div className="empty-dot" />
          <div>
            <strong>조건에 맞는 게임이 없습니다.</strong>
            <p>필터를 변경해서 다시 확인해주세요.</p>
          </div>
        </div>
      )}

      <nav className="pagination" aria-label="페이지 이동">
        {page > 1 ? (
          <a className="pagination-nav" href={queryString(params, { page: page - 1 })}>이전</a>
        ) : (
          <span className="pagination-nav disabled">이전</span>
        )}
        <div className="pagination-pages">
          {paginationItems(page, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="pagination-ellipsis">…</span>
            ) : (
              <a
                key={item}
                href={queryString(params, { page: item })}
                className={item === page ? "active" : ""}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </a>
            )
          )}
        </div>
        {page < totalPages ? (
          <a className="pagination-nav" href={queryString(params, { page: page + 1 })}>다음</a>
        ) : (
          <span className="pagination-nav disabled">다음</span>
        )}
      </nav>
    </main>
  );
}
