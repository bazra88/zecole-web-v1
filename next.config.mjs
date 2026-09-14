// @sparticuz/chromium(헤드리스 크로미움 바이너리, 약 64MB)은 lib/meta-store-import.js가
// 지역락 게임의 USD 가격을 조회할 때만 쓰는데(app/admin/actions.js에서만 호출됨), 예전엔
// "/**"로 모든 라우트에 포함시켜서 관련 없는 페이지/API 라우트 서버리스 함수마다 이 큰
// 바이너리가 중복으로 들어갔다 — Vercel 배포 저장 용량이 계속 쌓이는 주된 원인으로 보여서
// 실제로 쓰는 /admin 라우트에만 포함되게 좁혔다(2026-09-15).
const nextConfig = {
  outputFileTracingIncludes: {
    "/admin": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
