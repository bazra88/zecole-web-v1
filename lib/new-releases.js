import { featuredNewReleases, PINNED_RELEASE_ORDER } from "./new-release-order.mjs";
import { getGames } from "./supabase.js";

// 홈 "신규출시 VR 게임"과 런처용 공개 주소(/api/launcher/new-games)가 함께 쓰는 목록.
// 순서 규칙을 바꾸면 두 곳이 같이 바뀌도록 여기 한 곳에만 둔다.
// - 관리자가 고정한 신작이 먼저, 그다음 출시일 최신순(출시일 데이터가 없으면 등록일 최신순)
// - getGames가 active=true, admin_hidden=false로 거르므로 숨긴 게임은 나오지 않는다.
// strict=false(홈): 조회 하나가 실패해도 빈 목록으로 보고 화면을 그린다.
// strict=true(런처): 실패하면 예외를 던져, 부분 목록이 다른 순서로 캐시되지 않게 한다.
export async function loadFeaturedNewReleases({ strict = false, revalidate = 0 } = {}) {
  const [released, pinned, recent] = await Promise.allSettled([
    getGames({ limit: 15, releasedOnly: true, order: "release_date.desc.nullslast,name.asc", revalidate }),
    getGames({ limit: 15, newReleasePinned: true, order: PINNED_RELEASE_ORDER, revalidate }),
    getGames({ limit: 15, order: "created_at.desc,name.asc", revalidate }),
  ]);
  const rows = (result) => (result.status === "fulfilled" ? result.value.data || [] : []);

  if (strict) {
    const failed = released.status === "rejected" || pinned.status === "rejected"
      || (!rows(released).length && recent.status === "rejected");
    if (failed) throw new Error("신규출시 목록 조회 실패");
  }

  const automatic = rows(released).length ? rows(released) : rows(recent);
  return featuredNewReleases(rows(pinned), automatic);
}
