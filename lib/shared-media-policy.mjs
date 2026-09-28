const MARGIN = 5 * 60 * 1000;
export function mediaExpiry(raw) {
  try {
    const u = new URL(raw.replaceAll('&amp;', '&'));
    const hex = u.searchParams.get('oe');
    const seconds = hex && /^[a-f\d]+$/i.test(hex) ? parseInt(hex,16) : Number(u.searchParams.get('Expires') || 0);
    return seconds > 0 ? seconds * 1000 : null;
  } catch { return null; }
}
export function needsMediaRenewal(url, now = Date.now()) {
  const expiry = mediaExpiry(url);
  // Unsigned URLs are used as-is; a missing expiry is not evidence of expiry.
  return expiry !== null && expiry <= now + MARGIN;
}
export function inlineMediaNeedsRenewal(text, now = Date.now()) {
  return [...(text || '').matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].some(m=>needsMediaRenewal(m[1],now));
}
export function gameMediaNeedsRenewal(game, media, now = Date.now()) {
  return media.some(m=>needsMediaRenewal(m.url,now)||needsMediaRenewal(m.thumbnail_url,now)) ||
    inlineMediaNeedsRenewal(game.description_long,now)||inlineMediaNeedsRenewal(game.description_long_ko,now);
}
export function refreshIsPending(state, now = Date.now()) {
  return Boolean(state?.attempted_at && !state.completed_at && now-Date.parse(state.attempted_at)<120000);
}

// Preserve stable/self-hosted assets. Renew signed URLs in-place by slot; never
// download files, delete omitted assets, or accumulate a row per signed URL.
export function mediaRenewalPatches(existing, fresh, now = Date.now()) {
  return existing.flatMap(item=>{
    if (item.source !== 'meta_store') return [];
    const replacement = fresh.find(r=>r.media_type===item.media_type && (r.media_type==='trailer'||r.sort_order===item.sort_order));
    if (!replacement?.url || needsMediaRenewal(replacement.url,now)) return [];
    const patch = {};
    if ((mediaExpiry(item.url)!==null || !item.url) && item.url!==replacement.url) patch.url=replacement.url;
    if ((mediaExpiry(item.thumbnail_url)!==null || !item.thumbnail_url) && replacement.thumbnail_url &&
      !needsMediaRenewal(replacement.thumbnail_url,now) && item.thumbnail_url!==replacement.thumbnail_url) patch.thumbnail_url=replacement.thumbnail_url;
    return Object.keys(patch).length ? [{id:item.id,...patch}] : [];
  });
}
