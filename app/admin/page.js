import Link from "next/link";
import { adminIsConfigured, isAdmin } from "@/lib/admin-auth";
import { adminRest } from "@/lib/admin-supabase";
import { gameImageUrl } from "@/lib/supabase";
import { AdminImportForm, AdminLoginForm } from "./AdminForms";
import { logoutAction, setGameVisibilityAction } from "./actions";

export const dynamic = "force-dynamic";

async function loadGames(query, visibility) {
  const params = new URLSearchParams({
    select: "id,name,slug,source_image_url,image_path,meta_store_url,release_date,active,admin_hidden,created_at",
    order: "created_at.desc",
    limit: "100",
  });
  if (query) params.set("name", `ilike.*${query.replaceAll("*", "")}*`);
  if (visibility === "hidden") params.set("admin_hidden", "eq.true");
  if (visibility === "visible") params.set("admin_hidden", "eq.false");
  return adminRest(`games?${params.toString()}`);
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
  const games = await loadGames(query, visibility);
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><span className="eyebrow">ZECOLE ADMIN</span><h1>게임 관리자</h1></div>
        <form action={logoutAction}><button className="admin-secondary" type="submit">로그아웃</button></form>
      </header>

      <section className="admin-panel">
        <h2>신규 게임 등록</h2>
        <AdminImportForm />
      </section>

      <section className="admin-panel">
        <div className="admin-section-title"><div><h2>등록된 게임</h2><p>삭제는 데이터 보존을 위해 숨김 처리되며 언제든 복구할 수 있습니다.</p></div><strong>{games.length}개</strong></div>
        <form className="admin-filter" method="get">
          <input name="q" defaultValue={query} placeholder="게임 이름 검색" />
          <select name="visibility" defaultValue={visibility}>
            <option value="all">전체 상태</option><option value="visible">노출 중</option><option value="hidden">숨김</option>
          </select>
          <button type="submit">검색</button>
        </form>
        <div className="admin-game-list">
          {games.map((game) => (
            <article className={`admin-game-row${game.admin_hidden ? " is-hidden" : ""}`} key={game.id}>
              <div className="admin-game-image">{gameImageUrl(game.image_path) || game.source_image_url ? <img src={gameImageUrl(game.image_path) || game.source_image_url} alt="" /> : <span>NO IMAGE</span>}</div>
              <div className="admin-game-main">
                <strong>{game.name}</strong>
                <span>{game.release_date || "출시일 미확인"} · {game.active ? "활성" : "비활성"}</span>
                <div><Link href={`/games/${game.slug}`}>상세 보기</Link>{game.meta_store_url ? <a href={game.meta_store_url} target="_blank" rel="noreferrer">Meta 스토어</a> : null}</div>
              </div>
              <form action={setGameVisibilityAction}>
                <input type="hidden" name="id" value={game.id} />
                <input type="hidden" name="hidden" value={game.admin_hidden ? "false" : "true"} />
                <button className={game.admin_hidden ? "admin-restore" : "admin-danger"} type="submit">{game.admin_hidden ? "복구" : "숨기기"}</button>
              </form>
            </article>
          ))}
          {!games.length ? <p className="admin-empty">조건에 맞는 게임이 없습니다.</p> : null}
        </div>
      </section>
    </main>
  );
}
