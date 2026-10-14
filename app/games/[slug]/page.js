import RemoteGameMedia from "@/components/RemoteGameMedia";
import GameReviews from '@/components/GameReviews';
import { notFound } from "next/navigation";
import BackButton from "@/components/BackButton";
import GameMediaGallery from "@/components/GameMediaGallery";
import { motionSicknessLabel } from "@/lib/game-format";
import GamePurchasePanel from "@/components/GamePurchasePanel";
import { gameImageUrl, getGameBySlug, getGameGenres, getGameMedia, getGameReviews, getGameVideos } from "@/lib/supabase";
import { purchaseGame } from "@/lib/purchase-game";
import GameVisitRefresh from "@/components/GameVisitRefresh";

export const revalidate = 300;
// External refresh runs only after the detail component mounts, through POST /api/games/visit.
export const maxDuration = 60;

function dateLabel(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}


// 볼드(**text**)만 인라인으로 처리하고, 나머지는 텍스트 그대로 React가 이스케이프하도록 둔다.
function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${index}`}>{part}</span>
  );
}

// 메타 원문/번역 설명은 마크다운 헤더(#, ##)와 볼드(**)만 섞여있는 단순한 텍스트라
// 별도 마크다운 라이브러리 없이 문단/제목/볼드만 가볍게 처리한다.
// 헤더 줄 바로 다음에 빈 줄 없이 본문이 이어지는 경우가 있어서(예: "# 제목\n본문...")
// 문단 단위가 아니라 줄 단위로 훑으면서 헤더 줄만 따로 떼어낸다.
function LongDescription({ text }) {
  const blocks = [];
  let buffer = [];
  const flush = () => {
    const content = buffer.join(" ").trim();
    if (content) blocks.push({ type: "p", content });
    buffer = [];
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    // 개발자가 설명 안에 직접 넣은 이미지/영상: ![{"type":"image"|"video",...}](url)
    const media = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (media) {
      flush();
      let meta = {};
      try { meta = JSON.parse(media[1]); } catch {}
      blocks.push({ type: "media", url: media[2], mediaType: meta.type === "video" ? "video" : "image" });
    } else if (heading) {
      flush();
      blocks.push({ type: "h", content: heading[1].replace(/\*\*/g, "").trim() });
    } else if (!line) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return blocks.map((block, index) => {
    if (block.type === "media") {
      return block.mediaType === "video" ? (
        <RemoteGameMedia key={index} className="detail-inline-media" type="video" url={block.url} />
      ) : (
        <RemoteGameMedia key={index} className="detail-inline-media" url={block.url} />
      );
    }
    return block.type === "h"
      ? <h3 key={index}>{renderInline(block.content, `h${index}`)}</h3>
      : <p key={index}>{renderInline(block.content, `p${index}`)}</p>;
  });
}


function supportLabels(game) {
  return [game.supports_quest_3s && "Quest 3S", game.supports_quest_3 && "Quest 3", game.supports_quest_2 && "Quest 2"].filter(Boolean);
}

function koreanStoreLabel(game) {
  if (game.krw_store_available === true) return "이용 가능";
  if (game.krw_store_available === false || game.region_restricted) return "미출시";
  return "확인 전";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  if (!game) return { title: "게임을 찾을 수 없습니다" };
  return {
    title: game.name,
    description:
      game.description ||
      `${game.name}의 Meta Quest 게임 정보와 ZECOLE 제휴 구매 링크를 확인하세요.`,
  };
}

export default async function GameDetailPage({ params }) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  if (!game) notFound();

  const [videos, genres, rawMedia, reviews] = await Promise.all([
    getGameVideos(game.id).catch(() => []),
    getGameGenres(game.id).catch(() => []),
    getGameMedia(game.id).catch(() => []),
    getGameReviews(game.id).catch(() => ({data:[],count:0,page:1})),
  ]);
  const media = rawMedia;
  const trailer = media.find((item) => item.media_type === "trailer");
  const screenshots = media.filter((item) => item.media_type === "screenshot");
  const longDescription = game.description_long_ko || game.description_long;
  const image = gameImageUrl(game.image_path || game.source_image_url);
  const supports = supportLabels(game);
  const playStyles = [game.seated_supported && "좌식", game.standing_supported && "입식"].filter(Boolean);
  const facts = [
    ["출시일", dateLabel(game.release_date)],
    ["장르", genres.map((genre) => genre.name).join(" · ") || null],
    ["한국 스토어", koreanStoreLabel(game)],
    ["개발사", game.developer || null],
    ["퍼블리셔", game.publisher || null],
    ["지원 기기", supports.join(" · ") || null],
    ["지원 언어", game.supported_languages?.length ? game.supported_languages.join(" · ") : null],
    ["플레이 방식", playStyles.join(" · ") || null],
    ["멀미유발요소", motionSicknessLabel(game.motion_sickness_level)],
  ].filter(([, value]) => value);

  return (
    <GameVisitRefresh key={`visit-${game.id}`} gameId={game.id}>
    <main className="container detail-page">
      <BackButton />

      <section className="detail-hero">
        <GameMediaGallery
          gameId={game.id}
          metaStoreUrl={game.meta_store_url}
          trailer={trailer}
          screenshots={screenshots}
          image={image}
          gameName={game.name}
        />

        <GamePurchasePanel game={purchaseGame(game)} renderedAt={Date.now()} />
      </section>

      <section className="detail-overview">
        <div className="detail-description">
          <p className="eyebrow">ABOUT THIS GAME</p>
          <h2>게임 정보</h2>
          {longDescription ? (
            <div className="detail-long-description">
              <LongDescription text={longDescription} />
              {!game.description_long_ko ? (
                <p className="detail-description-note">※ 번역이 아직 준비되지 않아 원문(영어)으로 표시됩니다.</p>
              ) : null}
            </div>
          ) : (
            <p>{game.description || "공식 게임 소개를 준비하고 있습니다. Meta Store 원본 페이지에서 최신 정보를 먼저 확인할 수 있습니다."}</p>
          )}
        </div>
        <aside className="detail-facts">
          {facts.map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </aside>
      </section>

      {videos.length ? (
        <section className="detail-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">ZECOLE VIDEO</p>
              <h2>플레이 영상</h2>
            </div>
          </div>

          <div className="video-grid">
            {videos.map((video) => (
              <a
                key={video.id}
                href={video.youtube_url || `https://www.youtube.com/watch?v=${video.youtube_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" /> : null}
                <div className="video-grid-text">
                  <strong>{video.title || "ZECOLE 플레이 영상"}</strong>
                  <span>YouTube에서 보기 →</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <GameReviews key={`reviews-${game.id}`} gameId={game.id} initial={reviews} />

    </main>
    </GameVisitRefresh>
  );
}
