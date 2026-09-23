// Reuse a signed trailer link only while it has at least 15 minutes remaining.
export function reusableTrailer(media, now = Date.now()) {
  try {
    const url = new URL(media.url);
    if (url.protocol !== 'https:') return false;
    const hex = url.searchParams.get('oe');
    const expiry = hex && /^[a-f\d]+$/i.test(hex) ? parseInt(hex,16) : Number(url.searchParams.get('Expires') || 0);
    if (expiry) return expiry * 1000 > now + 15 * 60 * 1000;
    return Number.isFinite(Date.parse(media.updated_at)) && Date.parse(media.updated_at) > now - 3600000;
  } catch { return false; }
}
