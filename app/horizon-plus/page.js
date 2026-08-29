import GameCard from "@/components/GameCard";
import SectionHeader from "@/components/SectionHeader";
import { getHorizonPlus } from "@/lib/supabase";

export const revalidate = 300;

function Category({ id, title, description, rows }) {
  return (
    <section id={id} className="catalog-section">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      {rows.length ? (
        <div className="game-grid listing horizon-game-grid">
          {rows.map((row) =>
            row.game ? (
              <GameCard key={row.id} game={row.game} />
            ) : (
              <article key={row.id} className="game-card horizon-missing-card">
                <div className="game-thumb">
                  <div className="no-image">NO IMAGE</div>
                </div>
                <div className="game-card-body">
                  <strong className="game-title">
                    {row.external_game_name || "게임 DB 연결 항목"}
                  </strong>
                  <p className="region-note">게임 정보를 연결 중입니다.</p>
                </div>
              </article>
            )
          )}
        </div>
      ) : (
        <div className="empty-panel">
          <div className="empty-dot" />
          <div>
            <strong>이번 달 데이터 입력 전입니다.</strong>
            <p>월별 카탈로그를 입력하면 이곳에 자동으로 표시됩니다.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default async function HorizonPage() {
  const rows = await getHorizonPlus().catch(() => []);

  return (
    <main className="container page">
      <SectionHeader
        eyebrow="META HORIZON+"
        title="Horizon+ 구독 게임"
        description="월간 게임 2종, Horizon 카탈로그, 인디 카탈로그를 월별로 따로 기록합니다."
      />

      <Category
        id="monthly"
        title="월간 게임 2종"
        description="매월 별도로 제공되는 두 게임"
        rows={rows.filter((r) => r.category === "monthly_games")}
      />
      <Category
        id="catalog"
        title="Horizon 카탈로그"
        description="메인 Horizon+ 구독 카탈로그"
        rows={rows.filter((r) => r.category === "horizon_catalog")}
      />
      <Category
        id="indie"
        title="인디 카탈로그"
        description="인디 게임 중심의 별도 카탈로그"
        rows={rows.filter((r) => r.category === "indie_catalog")}
      />
    </main>
  );
}
