import 'server-only';
import { adminRest } from './admin-supabase';
import { relayApp, parseKrw, extractBaseInfo, extractOfferPricing, extractLongDescription, translateLongDescription, extractReviews, extractMedia } from './meta-collect.mjs';
import { visitCurrency, metaProductUrl, refreshInlineMedia, hasExpiredInlineMedia } from './game-visit-policy.mjs';
import { gameMediaNeedsRenewal, mediaRenewalPatches, refreshIsPending } from './shared-media-policy.mjs';
import { visitDeferral } from './visit-deferral-policy.mjs';
import { snapshotFailure, metaWasBlocked } from './meta-fetch-result.mjs';

const rpc = (name, body) => adminRest(`rpc/${name}`, { method:'POST', body:JSON.stringify(body) });

function visitStatus(state) {
  return {pending:refreshIsPending(state),attemptedAt:state?.attempted_at,completedAt:state?.completed_at,failed:state?.outcome==='refresh_failed',priceUnavailable:state?.outcome==='price_unavailable_or_currency_mismatch'};
}

export async function getVisitRefreshStatus(gameId) {
  const [state] = await adminRest(`game_visit_refresh?game_id=eq.${gameId}&select=attempted_at,completed_at,outcome`);
  return visitStatus(state);
}

async function skippedVisit(game, expired) {
  const [state] = await adminRest(`game_visit_refresh?game_id=eq.${game.id}&select=attempted_at,daily_attempted_at,completed_at,outcome`);
  const status = visitStatus(state);
  if (status.pending) return {skipped:true,...status};
  // Fresh checks and per-game cooldowns do not need regional budget reads.
  const now=Date.now();
  if (state && Date.parse(state.daily_attempted_at)>now-86400000 &&
    (!expired || Date.parse(state.attempted_at)>now-3600000)) {
    return {skipped:true,...status,...visitDeferral(state,expired,null,[],now)};
  }
  const region = visitCurrency(game);
  const [controls, attempts] = await Promise.all([
    adminRest(`meta_fetch_control?region=eq.${region}&select=paused_until,min_interval_seconds,hourly_limit,daily_limit,media_priority_until`),
    adminRest(`meta_fetch_attempts?region=eq.${region}&started_at=gt.${new Date(Date.now()-86400000).toISOString()}&select=started_at,success&order=started_at.desc&limit=1000`),
  ]);
  return {skipped:true,...status,...visitDeferral(state,expired,controls[0],attempts)};
}

export async function refreshGameOnVisit(gameId, {mediaOnly=false,visitId,attempt=0} = {}) {
  const [game] = await adminRest(`games?id=eq.${gameId}&active=eq.true&admin_hidden=eq.false&select=*`);
  if (!game) return { skipped:true };
  const media = await adminRest(`game_media?game_id=eq.${game.id}&active=eq.true&select=*`);
  const expired = gameMediaNeedsRenewal(game,media);
  if (mediaOnly && !expired) return {skipped:true};
  const claim = await rpc(visitId ? 'claim_game_visit_refresh_observed' : 'claim_game_visit_refresh', {
    p_game_id:game.id,p_media_expired:expired,
    ...(visitId ? {p_visit_id:visitId,p_attempt:attempt} : {}),
  });
  if (!claim) return skippedVisit(game,expired);
  const attemptedAt = claim.attempted_at;
  let observation = {}, mediaChanged = false, saved = null, reviews = [], metaSuccess = false, blocked = false;
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
      if (!response.ok) throw new Error(await snapshotFailure(response,'KRW'));
      html = (await response.json()).html;
    } else {
      const response = await fetch(url, { cache:'no-store', redirect:'follow', signal:AbortSignal.timeout(20000),
        headers:{Accept:'text/html','Accept-Language':'ko-KR,ko;q=0.9','User-Agent':'Mozilla/5.0 ZECOLEVisit/1.0'} });
      if (!response.ok) throw new Error(`us_snapshot_${response.status}`);
      html = await response.text();
    }
    const relay = relayApp(html, id);
    if (!relay) throw new Error('missing_relay');
    metaSuccess = true;
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
      const refreshed = refreshInlineMedia(game[field],description,Date.now()+5*60*1000);
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
    // Keep the claim pending until all URL writes finish. Other visitors poll
    // the same claim rather than reserving a separate trailer fetch.
    for (const {id:mediaId,...patch} of mediaRenewalPatches(media,extractMedia(relay))) {
      await adminRest(`game_media?game_id=eq.${game.id}&id=eq.${mediaId}`,{
        method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()}),
      });
      mediaChanged = true;
    }
    saved = await rpc('finish_game_visit_refresh', {
      p_game_id:game.id,p_attempted_at:attemptedAt,p_observation:observation,
    });
  } catch (error) {
    blocked = metaWasBlocked(error);
    observation.outcome = 'refresh_failed';
    console.error('[game-visit-refresh]',game.id,error.message);
  } finally {
    if (claim.fetch_token) await rpc('complete_meta_fetch',{
      p_token:claim.fetch_token,p_success:metaSuccess,p_blocked:blocked,
    }).catch(error=>console.error('[meta-fetch-result]',error.message));
  }
  const result = saved || await rpc('finish_game_visit_refresh', {
    p_game_id:game.id,p_attempted_at:attemptedAt,p_observation:observation,
  });
  return {...result,reviews,changed:Boolean(result.changed || mediaChanged),failed:observation.outcome === 'refresh_failed',priceUnavailable:observation.outcome === 'price_unavailable_or_currency_mismatch'};
}
