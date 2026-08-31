import Link from "next/link";
import { adminIsConfigured, isAdmin } from "@/lib/admin-auth";
import { adminRestPage } from "@/lib/admin-supabase";
import { gameImageUrl } from "@/lib/supabase";
import { AdminImportForm, AdminLoginForm } from "./AdminForms";
import AdminGameControls from "./AdminGameControls";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function loadGames(query, visibility, affiliate, sort, page) {
  const from = (page - 1) * PAGE_SIZE;
  const params = new URLSearchParams({
    select: "id,name,slug,affiliate_url,source_image_url,image_path,meta_store_url,release_date,active,admin_hidden,admin_new_release_pinned,beginner_recommended,advanced_recommended,zecole_recommended,created_at",
    order: sort === "oldest" ? "created_at.asc,id.asc" : "created_at.desc,id.desc",
    offset: String(from),
    limit: String(PAGE_SIZE),
  });
  if (query) params.set("name", `ilike.*${query.replaceAll("*", "")}*`);
  if (visibility === "hidden") params.set("admin_hidden", "eq.true");
  if (visibility === "visible") params.set("admin_hidden", "eq.false");
  if (affiliate === "missing") params.set("affiliate_url", "is.null");
  if (affiliate === "present") params.set("affiliate_url", "not.is.null");
  return adminRestPage(`games?${params.toString()}`);
}

function adminPageHref({ query, visibility, affiliate, sort, page }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (visibility !== "all") params.set("visibility", visibility);
  if (affiliate !== "all") params.set("affiliate", affiliate);
  if (sort !== "newest") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin?${search}` : "/admin";
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const validPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items = [];
  validPages.forEach((page, index) => {
    if (index && page - validPages[index - 1] > 1) items.push(`ellipsis-${page}`);
    items.push(page);
  });
  return items;
}

export default async function AdminPage({ searchParams }) {
  const loggedIn = await isAdmin();
  if (!loggedIn) {
    return (
      <main className="admin-shell admin-login-page">
        <section className="admin-login-card">
          <span className="eyebrow">ZECOLE ADMIN</span>
          <h1>게임 관리자</h1>
          <p>신규 게임을 등록하고 기존 카드를 관리합니다.</p>
          {!adminIsConfigured() ? <p className="admin-config-warning">배포 환경에 ADMIN_PASSWORD와 ADMIN_SESSION_SECRET을 설정해야 합니다.</p> : null}
          <AdminLoginForm />
        </section>
      </main>
    );
  }

  const params = await searchParams;
  const query = String(params?.q || "").trim();
  const visibility = ["all", "visible", "hidden"].includes(params?.visibility) ? params.visibility : "all";
  const affiliate = ["all", "missing", "present"].includes(params?.affiliate) ? params.affiliate : "all";
  const sort = ["newest", "oldest"].includes(params?.sort) ? params.sort : "newest";
  const requestedPage = Math.max(1, Number.parseInt(String(params?.page || "1"), 10) || 1);
  const initialResult = await loadGames(query, visibility, affiliate, sort, requestedPage);
  const totalPages = Math.max(1, Math.ceil(initialResult.total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const { data: games, total } = currentPage === requestedPage
    ? initialResult
    : await loadGames(query, visibility, affiliate, sort, currentPage);
  const hrefForPage = (page) => adminPageHref({ query, visibility, affiliate, sort, page });
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="eyebrow">ZECOLE ADMIN</span><h1><Link href="/admin">게임 관리자</Link></h1></div>
        <Link className="admin-home-link" href="/admin">⌂ 관리자 홈</Link>
        <form action={logoutAction}><button className="admin-secondary" type="submit">로그아웃</button></form>
      </header>

      <section className="admin-panel">
        <h2>신규 게임 등록</h2>
        <AdminImportForm />
      </section>

      <section className="admin-panel">
        <div className="admin-section-title"><div><h2>등록된 게임</h2><p>숨김은 복구할 수 있으며, DB 삭제는 확인 후 영구적으로 처리됩니다.</p></div><strong>전체 {total.toLocaleString("ko-KR")}개</strong></div>
        <form className="admin-filter" method="get">
          <input name="q" defaultValue={query} placeholder="게임 이름 검색" />
          <select name="visibility" defaultValue={visibility}>
            <option value="all">전체 상태</option><option value="visible">노출 중</option><option value="hidden">숨김</option>
          </select>
          <select name="affiliate" defaultValue={affiliate}>
            <option value="all">전체 제휴 링크</option><option value="missing">제휴 링크 없음</option><option value="present">제휴 링크 있음</option>
          </select>
          <select name="sort" defaultValue={sort}>
            <option value="newest">최근 추가된 순</option><option value="oldest">오래전에 추가된 순</option>
          </select>
          <button type="submit">검색</button>
        </form>
        <div className="admin-game-list">
          {games.map((game) => (
            <article className={`admin-game-row${game.admin_hidden ? " is-hidden" : ""}${game.admin_new_release_pinned ? " is-pinned" : ""}`} key={game.id}>
              <div className="admin-game-image">{gameImageUrl(game.image_path) || game.source_image_url ? <img src={gameImageUrl(game.image_path) || game.source_image_url} alt="" /> : <span>NO IMAGE</span>}</div>
              <div className="admin-game-main">
                <strong>{game.name}</strong>
                <span>{game.release_date || "출시일 미확인"} · {game.active ? "활성" : "비활성"}{game.admin_new_release_pinned ? " · 신규 출시 고정" : ""} · <b className={game.affiliate_url ? "has-affiliate" : "no-affiliate"}>{game.affiliate_url ? "제휴 링크 있음" : "제휴 링크 없음"}</b></span>
                {game.beginner_recommended || game.advanced_recommended || game.zecole_recommended ? (
                  <div className="admin-recommendation-summary">
                    {game.beginner_recommended ? <span>초보자</span> : null}
                    {game.advanced_recommended ? <span>숙련자</span> : null}
                    {game.zecole_recommended ? <span>ZECOLE 추천</span> : null}
                  </div>
                ) : null}
                <div><Link href={`/games/${game.slug}`}>상세 보기</Link>{game.meta_store_url ? <a href={game.meta_store_url} target="_blank" rel="noreferrer">Meta 스토어</a> : null}</div>
              </div>
              <AdminGameControls game={game} />
            </article>
          ))}
          {!games.length ? <p className="admin-empty">조건에 맞는 게임이 없습니다.</p> : null}
        </div>
        {totalPages > 1 ? (
          <nav className="admin-pagination" aria-label="게임 목록 페이지">
            {currentPage > 1 ? <Link href={hrefForPage(currentPage - 1)}>이전</Link> : <span className="is-disabled">이전</span>}
            <div>
              {paginationItems(currentPage, totalPages).map((item) => typeof item === "number"
                ? <Link className={item === currentPage ? "is-current" : ""} aria-current={item === currentPage ? "page" : undefined} href={hrefForPage(item)} key={item}>{item}</Link>
                : <span className="admin-pagination-ellipsis" key={item}>…</span>)}
            </div>
            {currentPage < totalPages ? <Link href={hrefForPage(currentPage + 1)}>다음</Link> : <span className="is-disabled">다음</span>}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
