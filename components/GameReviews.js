'use client';

import { useEffect, useState } from 'react';
import { needsReviewTranslation } from '@/lib/review-translation.mjs';

export default function GameReviews({gameId,initial}) {
  const [result,setResult] = useState(initial);
  const [page,setPage] = useState(1);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(false);
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    let timers = [];
    const refresh = event => {
      if (event.detail !== gameId) return;
      timers.forEach(clearTimeout);
      // Only read our DB: allow the background translation to become visible.
      timers = [1000,12000,45000].map(delay => setTimeout(() => setRevision(value => value + 1),delay));
    };
    window.addEventListener('game-visit-complete',refresh);
    return () => { window.removeEventListener('game-visit-complete',refresh); timers.forEach(clearTimeout); };
  },[gameId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    fetch(`/api/games/reviews?gameId=${encodeURIComponent(gameId)}&page=${page}`,{signal:controller.signal,cache:'no-store'})
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[gameId,page,revision]);
  if (!result.count && !error) return null;
  const pages = Math.max(1,Math.ceil(result.count / 5));
  return <section className="detail-section" id="reviews" aria-busy={loading}>
    <div className="section-header"><div><p className="eyebrow">META STORE REVIEWS</p><h2>이용자 리뷰</h2>
      <p className="review-meta">수집된 리뷰 {result.count}개 · 페이지당 5개</p></div></div>
    {error && <p role="alert">리뷰를 불러오지 못했습니다. <button onClick={() => setRevision(value => value + 1)}>다시 시도</button></p>}
    <div className="review-list">{result.data.map(review => {
      const pending = needsReviewTranslation(review);
      const translated = Boolean(review.title_ko?.trim() || review.body_ko?.trim());
      return <article className="review-card" key={review.id}>
        <div className="review-card-head"><strong>{review.reviewer_label}</strong>
          {review.rating ? <span className="review-stars" aria-label={`평점 ${review.rating}점`}>{'★'.repeat(Math.max(0,Math.min(5,review.rating)))}</span> : null}</div>
        <p className="review-translation-label">{pending ? '원문 포함 · 번역 준비 중' : translated ? 'Google 자동 번역' : '원문'}</p>
        {(review.title_ko || review.title_original) && <p className="review-title">{review.title_ko || review.title_original}</p>}
        <p className="review-body">{review.body_ko || review.body_original}</p>
        {translated && <details className="review-original"><summary>원문 보기</summary><p className="review-title">{review.title_original}</p><p className="review-body">{review.body_original}</p></details>}
        <div className="review-meta">{review.reviewed_at && <span>{new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Seoul'}).format(new Date(review.reviewed_at))}</span>}
          {review.helpful_count ? <span>도움됨 {review.helpful_count}</span> : null}</div>
      </article>;
    })}</div>
    {pages > 1 && <nav className="review-pagination" aria-label="리뷰 페이지">
      <button disabled={loading || result.page <= 1} onClick={() => setPage(result.page - 1)}>이전</button>
      <span aria-live="polite">{result.page} / {pages}{loading ? ' · 불러오는 중' : ''}</span>
      <button disabled={loading || result.page >= pages} onClick={() => setPage(result.page + 1)}>다음</button>
    </nav>}
  </section>;
}
