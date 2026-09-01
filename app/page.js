import Link from "next/link";
import GameCard from "@/components/GameCard";
import EmptyPanel from "@/components/EmptyPanel";
import SectionHeader from "@/components/SectionHeader";
import { getUsdKrwRate } from "@/lib/exchange-rate";
import { gameImageUrl, getContent, getGames, getHorizonPlus } from "@/lib/supabase";

export const revalidate = 300;

async function safeGames(options) {
  try {
    const result = await getGames({ ...options, revalidate: 0 });
    return result.data || [];
  } catch {
    return [];
  }
}

async function safeContent(type, limit) {
  try {
    return await getContent(type, limit);
  } catch {
    return [];
  }
}

async function safeHorizonPlus() {
  try {
    return await getHorizonPlus();
  } catch {
    return [];
  }
}

function HorizonTile({ href, number, title, description, games, monthly = false }) {
  const availableGames = games
    .map((row) => row.game)
    .filter((game) => game?.image_path || game?.source_image_url);
  const collageColumns = monthly
    ? 2
    : Math.max(1, Math.ceil(Math.sqrt(availableGames.length * 1.5)));
  const collageRows = monthly
    ? 1
    : Math.max(1, Math.ceil(availableGames.length / collageColumns));
  const collageSize = monthly ? 2 : collageColumns * collageRows;
  const collage = availableGames.length
    ? Array.from(
        { length: monthly ? Math.min(2, availableGames.length) : collageSize },
        (_, index) => availableGames[index % availableGames.length]
      )
    : [];

  return (
    <Link href={href} className="horizon-tile">
      <div
        className={`horizon-collage ${monthly ? "monthly" : "mosaic"}`}
        style={monthly ? undefined : { "--collage-columns": collageColumns, "--collage-rows": collageRows }}
        aria-hidden="true"
      >
        {collage.map((game, index) => (
          <img key={`${game.id}-${index}`} src={gameImageUrl(game.image_path || game.source_image_url)} alt="" />
        ))}
      </div>
      {monthly ? (
        <div className="monthly-game-names">
          {collage.map((game, index) => <b key={`${game.id}-${index}`}>{game.name}</b>)}
        </div>
      ) : null}
      <div className="horizon-tile-shade" />
      <div className="horizon-tile-copy">
        <span>{number}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </Link>
  );
}

export default async function Home() {
  const [
    newReleaseGames,
    pinnedNewReleaseGames,
    recentlyAddedGames,
    popularPaidGames,
    popularFreeGames,
    news,
    guides,
    videos,
    horizonPlus,
    usdKrwRate,
  ] = await Promise.all([
    safeGames({
      limit: 12,
      releasedOnly: true,
      order: "release_date.desc.nullslast,name.asc",
    }),
    safeGames({
      limit: 12,
      newReleasePinned: true,
      order: "created_at.desc,name.asc",
    }),
    safeGames({
      limit: 12,
      order: "created_at.desc,name.asc",
    }),
    safeGames({
      limit: 30,
      pricing: "paid",
      order: "popularity_score.desc.nullslast,review_count.desc.nullslast,name.asc",
    }),
    safeGames({
      limit: 12,
      pricing: "free",
      order: "review_count.desc.nullslast,name.asc",
    }),
    safeContent("vr_news", 3),
    safeContent("beginner_guide", 3),
    safeContent("youtube", 3),
    safeHorizonPlus(),
    getUsdKrwRate(),
  ]);

  const hasReleaseDates = newReleaseGames.length > 0;
  const automaticNewReleases = hasReleaseDates ? newReleaseGames : recentlyAddedGames;
  const pinnedNewReleaseIds = new Set(pinnedNewReleaseGames.map((game) => game.id));
  const featuredNewReleases = [
    ...pinnedNewReleaseGames,
    ...automaticNewReleases.filter((game) => !pinnedNewReleaseIds.has(game.id)),
  ].slice(0, 12);
  const featuredPopularPaid = popularPaidGames.slice(0, 12);
  const latestHorizonMonth = [...new Set(horizonPlus.map((row) => row.month).filter(Boolean))].sort().at(-1);
  const latestHorizon = latestHorizonMonth
    ? horizonPlus.filter((row) => row.month === latestHorizonMonth)
    : horizonPlus;
  const monthlyHorizon = latestHorizon.filter((row) => row.category === "monthly_games");
  const horizonCatalog = latestHorizon.filter((row) => row.category === "horizon_catalog");
  const indieCatalog = latestHorizon.filter((row) => row.category === "indie_catalog");

  return (
    <main>
      <section className="horizon-section">
        <div className="container section">
          <SectionHeader
            eyebrow="HORIZON+"
            title="호라이즌 플러스(Horizon+) 구독 게임목록"
            description="매월 바뀌는 세 종류의 구독 게임을 각각 관리합니다."
            href="/horizon-plus"
          />
          <div className="horizon-grid">
            <HorizonTile
              href="/horizon-plus#monthly"
              number="01"
              title="월간 게임 2종"
              description="이번 달 별도 제공되는 두 게임"
              games={monthlyHorizon}
              monthly
            />
            <HorizonTile
              href="/horizon-plus#catalog"
              number="02"
              title="Horizon 카탈로그"
              description="메인 구독 카탈로그 추가·제외 게임"
              games={horizonCatalog}
            />
            <HorizonTile
              href="/horizon-plus#indie"
              number="03"
              title="인디 카탈로그"
              description="인디 중심의 별도 게임 카탈로그"
              games={indieCatalog}
            />
          </div>
        </div>
      </section>

      <section className="container section">
        <SectionHeader
          eyebrow="NEW RELEASES"
          title="신규출시 VR 게임"
          description="새롭게 등록된 Meta Quest VR 게임을 확인하세요."
          href="/games?sort=release_desc"
        />
        {featuredNewReleases.length ? (
          <div className="game-grid">
            {featuredNewReleases.map((game) => (
              <GameCard key={game.id} game={game} usdKrwRate={usdKrwRate} />
            ))}
          </div>
        ) : (
          <EmptyPanel title="출시일 데이터 준비중">
            현재 게임 DB는 연결되어 있으며, 한국 Meta Store 출시일 데이터가
            채워지면 이 영역이 자동으로 최신순 정렬됩니다.
          </EmptyPanel>
        )}
      </section>

      <section className="container section">
        <SectionHeader
          eyebrow="POPULAR PAID"
          title="인기 유료 VR 게임"
          description="리뷰 수를 기준으로 인기작과 제휴 구매 혜택을 함께 보여줍니다."
          href="/games?pricing=paid&sort=reviews"
        />
        {featuredPopularPaid.length ? (
          <div className="game-grid">
            {featuredPopularPaid.map((game) => (
              <GameCard key={game.id} game={game} usdKrwRate={usdKrwRate} />
            ))}
          </div>
        ) : (
          <EmptyPanel title="인기순 데이터 준비중">
            기존 3,797개 게임은 정상 연결되어 있습니다. 리뷰 수 데이터가
            들어오면 인기순이 정확하게 동작합니다.
          </EmptyPanel>
        )}
      </section>

      <section className="container section home-free-section">
        <SectionHeader
          eyebrow="FREE TO START"
          title="인기 무료 VR 게임"
          description="기기 구매 후 추가 비용이 부담스럽다면 무료 게임부터 시작해보세요."
          href="/games?pricing=free&sort=reviews"
        />
        {popularFreeGames.length ? (
          <div className="game-grid">
            {popularFreeGames.map((game) => (
              <GameCard key={game.id} game={game} usdKrwRate={usdKrwRate} />
            ))}
          </div>
        ) : (
          <div className="free-placeholder">
            <span className="free-icon">50%</span>
            <div>
              <strong>무료 게임 분류 데이터 연결 준비중</strong>
              <p>
                무료 게임을 ZECOLE 제휴 링크로 받으면 적용되는 첫 인앱결제
                혜택도 게임별 데이터로 표시할 예정입니다.
              </p>
            </div>
            <Link href="/games">전체 게임 보기 →</Link>
          </div>
        )}
      </section>

      <section className="container section home-recommend-section">
        <SectionHeader
          eyebrow="ZECOLE PICK"
          title="VR 적응 단계별 추천"
          description="인기뿐 아니라 VR 멀미 적응 정도에 맞춰 게임을 고를 수 있게 합니다."
          href="/games"
        />
        <div className="recommend-grid">
          <Link href="/games?recommend=zecole">
            <span>🔥</span>
            <div>
              <strong>가장 인기있는 게임</strong>
              <p>대표 인기작과 ZECOLE 추천작</p>
            </div>
          </Link>
          <Link href="/games?recommend=beginner">
            <span>🌱</span>
            <div>
              <strong>초보자 입문용</strong>
              <p>멀미 부담이 낮은 게임부터</p>
            </div>
          </Link>
          <Link href="/games?recommend=advanced">
            <span>🚀</span>
            <div>
              <strong>숙련자 추천</strong>
              <p>자유이동에 적응한 유저에게</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="container section latest-content-section">
        <SectionHeader
          eyebrow="LATEST CONTENT"
          title="VR 뉴스 · 입문 가이드 · 영상"
        />
        <div className="media-grid">
          <Link href="/news" className="media-card news">
            <small>VR NEWS</small>
            <strong>{news[0]?.title || "VR 업계 최신 뉴스"}</strong>
            <p>
              {news[0]?.summary ||
                "Meta와 VR 업계의 중요한 소식을 한국어로 정리합니다."}
            </p>
          </Link>
          <Link href="/guide" className="media-card guide">
            <small>BEGINNER GUIDE</small>
            <strong>{guides[0]?.title || "VR 처음이신가요?"}</strong>
            <p>
              {guides[0]?.summary ||
                "기기 선택부터 멀미 적응, 첫 게임까지 단계별로 안내합니다."}
            </p>
          </Link>
          <Link href="/videos" className="media-card video">
            <small>YOUTUBE</small>
            <strong>{videos[0]?.title || "ZECOLE 최신 영상"}</strong>
            <p>
              {videos[0]?.summary ||
                "게임 플레이, 신규 출시, VR 뉴스와 제품 리뷰를 연결합니다."}
            </p>
          </Link>
        </div>
      </section>

      <section className="business-band">
        <div className="container business-inner">
          <div>
            <p className="eyebrow">BUSINESS</p>
            <h2>광고 · 리뷰 · 협업 제안</h2>
            <p>
              VR 게임/제품 리뷰, 스폰서십, 브랜드 협업 및 취재 문의를 받습니다.
            </p>
          </div>
          <Link href="/business" className="primary-button">
            비즈니스 문의하기
          </Link>
        </div>
      </section>
    </main>
  );
}
