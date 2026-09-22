export function visitCurrency(game) {
  if (game.krw_price != null) return 'KRW';
  return game.usd_price != null || game.region_restricted || game.krw_store_available === false ? 'USD' : 'KRW';
}

export function metaProductUrl(game) {
  const id = String(game.meta_product_id || '').match(/(\d{6,})\/?$/)?.[1];
  if (!id) throw new Error('missing_meta_id');
  return { id, url: `https://www.meta.com/ko-kr/experiences/${id}/` };
}

const inlinePattern = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
function identity(raw) {
  try { return new URL(raw.replaceAll('&amp;', '&')).pathname; } catch { return null; }
}
export function mediaUrlExpired(raw, now = Date.now()) {
  try {
    const url = new URL(raw.replaceAll('&amp;', '&'));
    const hex = url.searchParams.get('oe');
    const expires = hex && /^[a-f\d]+$/i.test(hex) ? parseInt(hex,16) : Number(url.searchParams.get('Expires') || 0);
    return expires > 0 && expires * 1000 <= now;
  } catch { return false; }
}

// Refresh only expired signed media URLs; keep the existing text and Korean translation.
export function hasExpiredInlineMedia(text, now = Date.now()) {
  return [...(text || '').matchAll(inlinePattern)].some(m => mediaUrlExpired(m[1],now));
}

export function refreshInlineMedia(text, freshDescription, now = Date.now()) {
  if (!text || !freshDescription) return text;
  const fresh = new Map([...freshDescription.matchAll(inlinePattern)].map(m => [identity(m[1]), m[1]]));
  return text.replace(inlinePattern, (markdown, url) => {
    const replacement = fresh.get(identity(url));
    return replacement && mediaUrlExpired(url, now) && !mediaUrlExpired(replacement, now)
      ? markdown.replace(url, replacement) : markdown;
  });
}
