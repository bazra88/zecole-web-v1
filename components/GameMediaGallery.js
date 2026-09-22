"use client";

import { useState } from "react";

export default function GameMediaGallery({ gameId, metaStoreUrl, trailer, screenshots, image, gameName }) {
  const items = [
    ...(trailer ? [{ type: "trailer", thumb: trailer.thumbnail_url }] : []),
    ...screenshots.map((shot) => ({ type: "screenshot", url: shot.url, thumb: shot.thumbnail_url || shot.url })),
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // 트레일러 mp4 링크는 저장해두지 않고 재생 버튼을 눌렀을 때만 즉석에서 조회한다
  // (app/api/media/trailer/route.js) — 용량 문제로 자체저장을 포기한 대신, 방문자가
  // 실제로 보려는 순간에만 메타에 요청이 가게 하는 절충.
  const [trailerUrl, setTrailerUrl] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState(false);
  const active = items[activeIndex];

  function selectThumb(index) {
    setActiveIndex(index);
    setLightboxOpen(false);
  }

  async function loadTrailer() {
    if (trailerUrl || trailerLoading) return;
    setTrailerLoading(true);
    setTrailerError(false);
    try {
      const response = await fetch(`/api/media/trailer?gameId=${gameId}`);
      const body = await response.json().catch(() => null);
      if (response.ok && body?.url) setTrailerUrl(body.url);
      else setTrailerError(true);
    } catch {
      setTrailerError(true);
    } finally {
      setTrailerLoading(false);
    }
  }

  return (
    <div className="detail-media">
      <div
        className="detail-image"
        onClick={() => { if (active?.type === "screenshot") setLightboxOpen(true); }}
      >
        {active ? (
          active.type === "trailer" ? (
            trailerUrl ? (
              <video key={trailerUrl} controls autoPlay poster={active.thumb || undefined} src={trailerUrl} />
            ) : (
              <button type="button" className="detail-video-poster" onClick={loadTrailer} aria-label="트레일러 재생">
                {active.thumb ? <img src={active.thumb} alt="" /> : null}
                {trailerLoading ? (
                  <span className="detail-media-status">불러오는 중…</span>
                ) : trailerError ? (
                  <span className="detail-media-status">
                    트레일러를 불러오지 못했어요.
                    {metaStoreUrl ? (
                      <a href={metaStoreUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                        메타 스토어에서 보기
                      </a>
                    ) : null}
                  </span>
                ) : (
                  <span className="detail-thumb-play detail-video-play" aria-hidden="true">▶</span>
                )}
              </button>
            )
          ) : (
            <img key={active.url} src={active.url} alt={`${gameName} 스크린샷`} />
          )
        ) : image ? (
          <img src={image} alt={gameName} />
        ) : (
          <div className="no-image">NO IMAGE</div>
        )}
      </div>

      {items.length > 1 ? (
        <div className="detail-thumb-strip">
          {items.map((item, index) => (
            <button
              key={`${item.type}-${index}`}
              type="button"
              className={`detail-thumb${index === activeIndex ? " active" : ""}`}
              onClick={() => selectThumb(index)}
              aria-label={item.type === "trailer" ? "트레일러 보기" : "스크린샷 보기"}
              aria-current={index === activeIndex}
            >
              <img src={item.thumb} alt="" loading="lazy" />
              {item.type === "trailer" ? <span className="detail-thumb-play" aria-hidden="true">▶</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen && active?.type === "screenshot" ? (
        <div className="detail-lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxOpen(false)}>
          <img src={active.url} alt={`${gameName} 스크린샷 확대`} />
          <button
            type="button"
            className="detail-lightbox-close"
            onClick={(event) => { event.stopPropagation(); setLightboxOpen(false); }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
