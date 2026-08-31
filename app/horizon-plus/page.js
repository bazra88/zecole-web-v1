import GameCard from "@/components/GameCard";
import SectionHeader from "@/components/SectionHeader";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { getHorizonPlus } from "@/lib/supabase";

export const revalidate = 300;

function Category({ id, title, description, rows, usdKrwRate }) {
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
              <GameCard key={row.id} game={row.game} usdKrwRate={usdKrwRate} catalogStatus={row.status} />
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

function rowKey(row) {
  const identity = row.game_id ? `id:${row.game_id}` : `name:${String(row.external_game_name || "").trim().toLowerCase()}`;
  return `${row.category}:${identity}`;
}

function compareSnapshots(rows) {
  const months = [...new Set(rows.map((row) => row.month).filter(Boolean))].sort();
  const latestMonth = months.at(-1);
  const previousMonth = months.at(-2);
  const current = rows.filter((row) => row.month === latestMonth);
  const previous = rows.filter((row) => row.month === previousMonth);
  const previousKeys = new Set(previous.map(rowKey));
  const currentKeys = new Set(current.map(rowKey));
  const categories = ["monthly_games", "horizon_catalog", "indie_catalog"];
  const active = Object.fromEntries(categories.map((category) => [category, current
    .filter((row) => row.category === category)
    .map((row) => ({ ...row, status: previousMonth && !previousKeys.has(rowKey(row)) ? "added" : null }))
    .sort((left, right) => Number(right.status === "added") - Number(left.status === "added"))]));
  const removed = Object.fromEntries(categories.map((category) => [category, previous.filter((row) => row.category === category && !currentKeys.has(rowKey(row))).map((row) => ({ ...row, status: "removed" }))]));
  return { active, removed, previousMonth };
}

export default async function HorizonPage() {
  const [rows, usdKrwRate] = await Promise.all([
    getHorizonPlus().catch(() => []),
    getUsdKrwRate(),
  ]);
  const { active, removed, previousMonth } = compareSnapshots(rows);

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
        rows={active.monthly_games}
        usdKrwRate={usdKrwRate}
      />
      <Category
        id="catalog"
        title="Horizon 카탈로그"
        description="메인 Horizon+ 구독 카탈로그"
        rows={active.horizon_catalog}
        usdKrwRate={usdKrwRate}
      />
      <Category
        id="indie"
        title="인디 카탈로그"
        description="인디 게임 중심의 별도 카탈로그"
        rows={active.indie_catalog}
        usdKrwRate={usdKrwRate}
      />
      {previousMonth ? (
        <section className="catalog-removed-section">
          <SectionHeader eyebrow="CATALOG CHANGES" title="지난달 대비 제외된 게임" description={`${previousMonth} 스냅샷과 비교한 결과입니다.`} />
          {Object.entries({ monthly_games: "월간 게임", horizon_catalog: "Horizon 카탈로그", indie_catalog: "인디 카탈로그" }).map(([category, title]) => (
            removed[category].length ? <Category key={category} id={`removed-${category}`} title={title} description="이번 달 카탈로그에서 제외된 게임" rows={removed[category]} usdKrwRate={usdKrwRate} /> : null
          ))}
        </section>
      ) : null}
    </main>
  );
}
