// /api/는 방문 시 메타 재조회를 일으키는 엔드포인트라 검색엔진 렌더러가 호출하지 않게 막는다.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin'],
    },
  };
}
