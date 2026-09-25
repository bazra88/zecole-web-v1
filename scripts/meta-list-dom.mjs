export function readMetaList() {
  const pricePattern = /(?:US\$|USD\s*|KRW\s*|\$|₩|￦)\s*\d[\d,]*(?:\.\d{2})?/g;
  const amount = text => Number(text.replace(/[^\d.]/g, ''));
  const currency = text => /₩|￦|KRW/.test(text) ? 'KRW' : /\$|USD/.test(text) ? 'USD' : null;
  function cards() {
    return [...document.querySelectorAll('a[href]')].flatMap(a => {
      const url = new URL(a.href);
      const match = url.pathname.match(/\/experiences\/(?:(?!section\/|view\/)[^/]+\/)?(\d{6,})\/?$/);
      if (!match || !a.querySelector('img')) return [];
      const text = a.innerText.trim();
      const name = a.querySelector('[data-interactable]')?.textContent?.trim();
      if (!name || !text) return [];
      const prices = text.match(pricePattern) || [];
      const crossedOut = [...a.querySelectorAll('s,del,span')].filter(el =>
        el.matches('s,del') || getComputedStyle(el).textDecorationLine.includes('line-through')
      ).flatMap(el => el.textContent.match(pricePattern) || []);
      const uniquePrices = [...new Set(prices)];
      const current = uniquePrices.filter(p => !crossedOut.includes(p));
      const currentText = current.length === 1 ? current[0] : uniquePrices.length === 1 && !crossedOut.length ? uniquePrices[0] : null;
      const oldPrices = [...new Set(crossedOut)];
      const img = a.querySelector('img');
      const timerText = text.split('\n').filter(line => /남음|종료|까지|ends?\b|remaining/i.test(line));
      return [{
        meta_id: match[1], name, url: url.origin + url.pathname,
        current_price: currentText ? amount(currentText) : null,
        original_price: oldPrices.length === 1 ? amount(oldPrices[0]) : null,
        currency: currentText ? currency(currentText) : null,
        price_tokens: uniquePrices,
        price_ambiguous: uniquePrices.length > 0 && !currentText,
        availability: /준비 중|coming soon/i.test(text) ? 'coming_soon' : /(?:^|\n)(?:받기|무료|Get|Free)(?:\n|$)/i.test(text) ? 'get_or_free' : 'other',
        thumbnail_url: img.currentSrc || img.src || null,
        visible_timer_text: timerText,
        visible_time_elements: [...a.querySelectorAll('time[datetime]')].map(el => ({ text: el.textContent, datetime: el.getAttribute('datetime') })),
        raw_text: text, checked_at: new Date().toISOString(),
      }];
    });
  }

 const root = document.getElementById('scrollview') || document.scrollingElement;
 const pending = [...document.querySelectorAll('[role="progressbar"]')].filter(e=>e.getClientRects().length);
 return {cards:cards(),pending:pending.length,pending_y:pending[0]?.getBoundingClientRect().top??null,top:root.scrollTop,height:root.scrollHeight,viewport:root.clientHeight,bottom:root.scrollTop+root.clientHeight>=root.scrollHeight-8,blocked:/temporarily blocked|too many requests|일시적으로 차단|요청이 너무 많/i.test(document.body.innerText)};
}
