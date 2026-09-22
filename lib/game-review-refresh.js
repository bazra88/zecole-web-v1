import 'server-only';
import { adminRest } from './admin-supabase';
import { translateReviewText } from './review-translation.mjs';

export async function refreshReviewTranslations(gameId, reviews = []) {
  const [game] = await adminRest(`games?id=eq.${gameId}&active=eq.true&admin_hidden=eq.false&select=id`);
  if (!game) return;
  // Persist originals first, so a Google outage cannot lose newly collected reviews.
  if (reviews.length) await adminRest('game_reviews?on_conflict=game_id,meta_review_id', {
    method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},
    body:JSON.stringify(reviews.map(review => ({...review,game_id:gameId,source:'meta_store',active:true}))),
  });
  const pending = await adminRest('rpc/claim_review_translations', {method:'POST',body:JSON.stringify({p_game_id:gameId})});
  const signal = AbortSignal.timeout(40000);
  // At most five reviews per visit, two workers, and one attempt per row per day.
  const queue = [...pending];
  await Promise.all([0,1].map(async () => {
    while (queue.length && !signal.aborted) {
      const review = queue.shift();
      const patch = {};
      for (const field of ['title','body']) {
        if (!review[`${field}_original`]?.trim() || review[`${field}_ko`]?.trim()) continue;
        try { patch[`${field}_ko`] = await translateReviewText(review[`${field}_original`],{signal}); }
        catch (error) { console.error('[review-translation]',review.id,error.message); }
      }
      if (Object.keys(patch).length) await adminRest(`game_reviews?id=eq.${review.id}`, {
        method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()}),
      });
    }
  }));
}
