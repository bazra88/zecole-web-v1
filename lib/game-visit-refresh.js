import 'server-only';
import { adminRest } from './admin-supabase';
import { relayApp, parseKrw, extractBaseInfo, extractOfferPricing, extractLongDescription, translateLongDescription, extractReviews } from './meta-collect.mjs';
import { visitCurrency, metaProductUrl, refreshInlineMedia, hasExpiredInlineMedia } from './game-visit-policy.mjs';
import { ensureGameDetailCached } from './game-media-backfill';

const rpc = (name, body) => adminRest(`rpc/${name}`, { method:'POST', body:JSON.stringify(body) });

export async function refreshGameOnVisit(gameId) {
  const [game] = await adminRest(`games?id=eq.${gameId}&active=eq.true&admin_hidden=eq.false&select=*`);
  if (!game) return { skipped:true };
  const claim = await rpc('claim_game_visit_refresh', { p_game_id:game.id,
    p_media_expired:hasExpiredInlineMedia(game.description_long) || hasExpiredInlineMedia(game.description_long_ko) });
  if (!claim) return { skipped:true };
  const attemptedAt = claim.attempted_at;
  let observation = {}, mediaChanged = false, saved = null, reviews = [];
  try {
    const currency = visitCurrency(game);
    const { id, url } = metaProductUrl(game);
    let html;
    if (currency === 'KRW') {
      const apiUrl = process.env.IMPORT_API_URL;
      const secret = process.env.IMPORT_API_SECRET;
      if (!apiUrl || !secret) throw new Error('kr_endpoint_unconfigured');
      const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/visit-snapshot`, {
        method:'POST', cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},
        body:JSON.stringify({game_id:game.id,attempted_at:attemptedAt}), signal:AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`kr_snapshot_${response.status}`);
      html = (await response.json()).html;
    } else {
      const response = await fetch(url, { cache:'no-store', redirect:'follow', signal:AbortSignal.timeout(20000),
        headers:{Accept:'text/html','Accept-Language':'ko-KR,ko;q=0.9','User-Agent':'Mozilla/5.0 ZECOLEVisit/1.0'} });
      if (!response.ok) throw new Error(`us_snapshot_${response.status}`);
      html = await response.text();
    }
    const relay = relayApp(html, id);
    if (!relay) throw new Error('missing_relay');
    if (claim.refresh_daily) reviews = extractReviews(relay);
    const base = extractBaseInfo(html,relay,id);
    if (claim.refresh_daily && base.rating != null && Number.isFinite(Number(base.rating))) observation.rating = Number(base.rating);
    if (claim.refresh_daily && base.reviewCount != null && Number.isInteger(Number(base.reviewCount))) observation.review_count = Number(base.reviewCount);
    const price = parseKrw(html,id,relay);
    if (!claim.refresh_daily) observation.outcome = 'ok';
    else if (price.found && Number.isFinite(price.price) && price.price >= 0 && price.currency === currency) {
      const offer = extractOfferPricing(relay);
      observation = {...observation, price:price.price,currency,outcome:'ok'};
      const currentOffer = relay.current_offer;
      if (currentOffer?.strikethrough_price?.currency === currency && offer.originalPrice > price.price) {
        observation.original_price = offer.originalPrice;
      }
      if (currentOffer && Object.hasOwn(currentOffer,'end_time')) observation.offer_ends_at = offer.offerEndsAt;
      if (currentOffer && Object.hasOwn(currentOffer,'show_timer')) observation.show_timer = offer.showTimer;
    } else {
      observation.outcome = 'price_unavailable_or_currency_mismatch';
    }
    const description = extractLongDescription(relay);
    for (const field of ['description_long','description_long_ko']) {
      const refreshed = refreshInlineMedia(game[field],description);
      if (refreshed !== game[field]) observation[field] = refreshed;
    }
    if (description && !hasExpiredInlineMedia(description) &&
      (hasExpiredInlineMedia(observation.description_long ?? game.description_long) ||
       hasExpiredInlineMedia(observation.description_long_ko ?? game.description_long_ko))) {
      // A developer may replace/remove a media asset entirely. Refresh the full
      // description only in that case; ordinary URL renewal needs no translation.
      observation.description_long = description;
      observation.description_long_ko = await translateLongDescription(description);
    }
    saved = await rpc('finish_game_visit_refresh', {
      p_game_id:game.id,p_attempted_at:attemptedAt,p_observation:observation,
    });
    // Use the same page response for screenshot storage; never make a second Meta request.
    const media = await adminRest(`game_media?game_id=eq.${game.id}&select=*`);
    const cached = await ensureGameDetailCached(game,media,{html});
    mediaChanged = cached.changed;
  } catch (error) {
    observation.outcome = 'refresh_failed';
    console.error('[game-visit-refresh]',game.id,error.message);
  }
  const result = saved || await rpc('finish_game_visit_refresh', {
    p_game_id:game.id,p_attempted_at:attemptedAt,p_observation:observation,
  });
  return {...result,reviews,changed:Boolean(result.changed || mediaChanged),failed:observation.outcome !== 'ok'};
}
