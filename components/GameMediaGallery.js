"use client";

import { useState } from "react";
import { needsMediaRenewal } from "@/lib/shared-media-policy.mjs";
import { useMediaRefreshStatus } from "./GameVisitRefresh";
import RemoteGameMedia from "./RemoteGameMedia";

export default function GameMediaGallery({ gameId, metaStoreUrl, trailer, screenshots, image, gameName }) {
  const items = [
    ...(trailer ? [{ type: "trailer", thumb: trailer.thumbnail_url }] : []),
    ...screenshots.map((shot) => ({ type: "screenshot", url: shot.url, thumb: shot.thumbnail_url || shot.url })),
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Resolve only expired links; valid media is loaded directly by the browser.
  const refreshStatus = useMediaRefreshStatus();
  const [trailerUrl, setTrailerUrl] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState(false);
  const active = items[activeIndex] || items[0];
  const savedTrailer = trailer?.url && !needsMediaRenewal(trailer.url) ? trailer.url : null;
  const playableUrl = trailerUrl && !needsMediaRenewal(trailerUrl) ? trailerUrl : null;

  function selectThumb(index) {
    setActiveIndex(index);
    setLightboxOpen(false);
  }

  async function loadTrailer() {
    if (trailerLoading) return;
    if (playableUrl) { setTrailerError(false); return; }
    if (savedTrailer) { setTrailerError(false); setTrailerUrl(savedTrailer); return; }
    if (refreshStatus === "checking") return;
    setTrailerLoading(true);
    setTrailerError(false);
    try {
      const signal = AbortSignal.timeout(65000);
      let response = await fetch(`/api/media/trailer?gameId=${gameId}`, { signal });
      let body = await response.json().catch(() => null);
      for (let attempt = 0; body?.pending && attempt < 18; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        response = await fetch(`/api/media/trailer?gameId=${gameId}&cacheOnly=1`, { signal, cache: "no-store" });
        body = await response.json().catch(() => null);
      }
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
            playableUrl && !trailerError ? (
              <video key={playableUrl} controls autoPlay poster={!needsMediaRenewal(active.thumb) ? active.thumb || undefined : undefined} src={playableUrl} onError={() => setTrailerError(true)} />
            ) : (
              <button type="button" className="detail-video-poster" onClick={loadTrailer} disabled={trailerLoading || (!savedTrailer && refreshStatus === "checking")} aria-label="트레일러 재생">
                {active.thumb && !needsMediaRenewal(active.thumb) ? <img src={active.thumb} alt="" /> : null}
                {trailerLoading || (!savedTrailer && refreshStatus === "checking") ? (
                  <span className="detail-media-status">불러오는 중…</span>
                ) : trailerError ? (
                  <span className="detail-media-status">
                    트레일러를 불러오지 못했어요.
                  </span>
                ) : (
                  <span className="detail-thumb-play detail-video-play" aria-hidden="true">▶</span>
                )}
              </button>
            )
          ) : (
            <RemoteGameMedia key={active.url} url={active.url} alt={`${gameName} 스크린샷`} />
          )
        ) : image ? (
          <img src={image} alt={gameName} />
        ) : (
          <div className="no-image">NO IMAGE</div>
        )}
      </div>

      {trailerError && active?.type === "trailer" && metaStoreUrl ? (
        <a href={metaStoreUrl} target="_blank" rel="noreferrer">메타 스토어에서 보기</a>
      ) : null}

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
              {item.thumb && !needsMediaRenewal(item.thumb) ? <img src={item.thumb} alt="" loading="lazy" /> : <span aria-hidden="true">…</span>}
              {item.type === "trailer" ? <span className="detail-thumb-play" aria-hidden="true">▶</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {lightboxOpen && active?.type === "screenshot" ? (
        <div className="detail-lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxOpen(false)}>
          <RemoteGameMedia url={active.url} alt={`${gameName} 스크린샷 확대`} />
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
