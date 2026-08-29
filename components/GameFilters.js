"use client";

export default function GameFilters({ search, pricing, priceRange, recommendation, genre, genres, sort, pageSize }) {
  function applySelectedFilter(event) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="game-toolbar" method="get">
      <input
        type="search"
        name="q"
        defaultValue={search}
        placeholder="게임 이름 검색 후 Enter"
        aria-label="게임 이름 검색"
      />

      <select name="pricing" defaultValue={pricing} aria-label="가격 유형" onChange={applySelectedFilter}>
        <option value="">전체 가격</option>
        <option value="paid">유료 게임</option>
        <option value="free">무료 게임</option>
      </select>

      <select name="price_range" defaultValue={priceRange} aria-label="가격대" onChange={applySelectedFilter}>
        <option value="">전체 가격대</option>
        <option value="under_10000">1만원 미만</option>
        <option value="10000_30000">1만원–3만원</option>
        <option value="30000_50000">3만원–5만원</option>
        <option value="over_50000">5만원 이상</option>
      </select>

      <select name="recommend" defaultValue={recommendation} aria-label="추천 단계" onChange={applySelectedFilter}>
        <option value="">전체 추천 단계</option>
        <option value="beginner">초보자 추천</option>
        <option value="advanced">숙련자 추천</option>
        <option value="zecole">ZECOLE 추천</option>
      </select>

      <select name="genre" defaultValue={genre} aria-label="장르" onChange={applySelectedFilter}>
        <option value="">전체 장르</option>
        {(genres || []).map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
      </select>

      <select name="sort" defaultValue={sort} aria-label="정렬" onChange={applySelectedFilter}>
        <option value="name">이름순</option>
        <option value="price_asc">가격 낮은순</option>
        <option value="price_desc">가격 높은순</option>
        <option value="release_desc">출시일 최신순</option>
        <option value="release_asc">출시일 오래된순</option>
        <option value="discount">할인율 높은순</option>
        <option value="reviews">리뷰수 많은순</option>
        <option value="rating">평점 높은순</option>
      </select>

      <select name="page_size" defaultValue={String(pageSize)} aria-label="페이지당 게임 수" onChange={applySelectedFilter}>
        <option value="24">24개씩</option>
        <option value="48">48개씩</option>
        <option value="100">100개씩</option>
      </select>
    </form>
  );
}
