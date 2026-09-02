"use client";

import { useState } from "react";

export default function GameMediaGallery({ trailer, screenshots, image, gameName }) {
  const items = [
    ...(trailer ? [{ type: "trailer", url: trailer.url, thumb: trailer.thumbnail_url }] : []),
    ...screenshots.map((shot) => ({ type: "screenshot", url: shot.url, thumb: shot.thumbnail_url || shot.url })),
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const active = items[activeIndex];

  function selectThumb(index) {
    setActiveIndex(index);
    setLightboxOpen(false);
  }

  return (
    <div className="detail-media">
      <div
        className="detail-image"
        onClick={() => { if (active?.type === "screenshot") setLightboxOpen(true); }}
      >
        {active ? (
          active.type === "trailer" ? (
            <video key={active.url} controls preload="none" poster={active.thumb || undefined} src={active.url} />
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
