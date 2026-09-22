// Review translations are independent of Meta collection and never fetch Meta.
export async function translateReviewText(text, { signal, fetcher = fetch } = {}) {
  if (!text?.trim()) return null;
  const chunks = Array.from(text).join('').match(/[\s\S]{1,1500}/gu) || [];
  const translated = [];
  for (const chunk of chunks) {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.search = new URLSearchParams({client:'gtx',sl:'auto',tl:'ko',dt:'t',q:chunk}).toString();
    const response = await fetcher(url, {cache:'no-store',signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error(`google_translate_${response.status}`);
    const data = await response.json();
    const result = data?.[0]?.map(part => part?.[0] || '').join('');
    if (!result?.trim()) throw new Error('google_translate_empty');
    translated.push(result);
  }
  return translated.join('');
}

export function needsReviewTranslation(review) {
  return ['title','body'].some(field => review[`${field}_original`]?.trim() && !review[`${field}_ko`]?.trim());
}
