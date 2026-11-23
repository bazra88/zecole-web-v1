import { launcherNewGamesPayload } from "@/lib/launcher-feed.mjs";
import { loadFeaturedNewReleases } from "@/lib/new-releases";
import { gameImageUrl } from "@/lib/supabase";

// ZECOLE VR 런처 홈 화면용 "신규출시 게임" 공개 주소(읽기 전용, 인증 없음).
// 홈 "신규출시 VR 게임"과 같은 순서의 앞 8개를 돌려준다.
// Vercel 엣지에 10분 캐시해 런처가 많아도 DB 조회는 거의 늘지 않는다.
// 조회 실패 시 빈 목록 + 503을 캐시 없이 돌려주고, 런처는 이 칸을 숨긴다.
const COMMON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
};

export async function GET() {
  const now = new Date();
  try {
    const games = await loadFeaturedNewReleases({ strict: true });
    return Response.json(launcherNewGamesPayload(games, { imageUrl: gameImageUrl, now }), {
      headers: { ...COMMON_HEADERS, "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch {
    return Response.json(launcherNewGamesPayload([], { imageUrl: gameImageUrl, now }), {
      status: 503,
      headers: { ...COMMON_HEADERS, "Cache-Control": "no-store" },
    });
  }
}
