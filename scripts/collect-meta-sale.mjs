// Read-only collector: one section navigation, incremental scrolling, no detail visits or DB writes.
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.META_SECTION_URL || 'https://www.meta.com/ko-kr/experiences/section/28128149733502312/';
const expected = process.env.EXPECTED_CURRENCY;
if (!['KRW', 'USD'].includes(expected)) throw new Error('EXPECTED_CURRENCY must be KRW or USD');
const output = process.env.SALE_OUTPUT || `sale-${expected}`;
await mkdir(output, { recursive: true });
let browser;
if (process.env.SERVER_CHROMIUM === '1') {
  const { chromium } = await import('playwright-core');
  const { default: binary } = await import('@sparticuz/chromium');
  browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args, headless: true });
} else {
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: false });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
const startedAt = new Date().toISOString();
const rows = new Map();
const progress = [];
let complete = false, error = null, bottomSince = null, lastGrowth = Date.now();
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.mouse.move(640, 500);
  for (let step = 0; step < 400; step++) {
    const cancel = page.getByRole('button', { name: '취소', exact: true });
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
    const state = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('a[href]')].flatMap(a => {
        const m = new URL(a.href).pathname.match(/\/experiences\/(?:(?!section\/|view\/)([^/]+)\/)?(\d{6,})\/?$/);
        if (!m) return [];
        const text = a.innerText || '';
        const name = a.querySelector('[data-interactable]')?.textContent?.trim();
        const prices = text.match(/(?:US\$|\$|₩)\s*[\d,]+(?:\.\d{2})?/g) || [];
        const amount = s => s == null ? null : Number(s.replace(/[^\d.]/g, ''));
        const original = a.querySelector('s,del')?.textContent?.trim();
        const img = a.querySelector('img');
        return [{ meta_id: m[2], name, current_price: prices.length ? amount(prices[0]) : null, original_price: original ? amount(original) : null, currency: prices[0]?.includes('₩') ? 'KRW' : prices[0]?.includes('$') ? 'USD' : null, thumbnail_url: img?.currentSrc || img?.src || null, url: a.href, raw_text: text }];
      });
      const scroll = document.getElementById('scrollview') || document.scrollingElement;
      const placeholders = [...document.querySelectorAll('[role="progressbar"]')].filter(e => e.getClientRects().length);
      const pending = placeholders.length;
      return { cards, pending, pending_y: placeholders[0]?.getBoundingClientRect().top ?? null, top: scroll.scrollTop, height: scroll.scrollHeight, viewport: scroll.clientHeight, bottom: scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8 };
    });
    const old = rows.size;
    for (const row of state.cards) if (row.name) rows.set(row.meta_id, { ...row, checked_at: new Date().toISOString() });
    if (rows.size > old) { lastGrowth = Date.now(); bottomSince = null; }
    const { cards, ...position } = state;
    progress.push({ step, count: rows.size, ...position });
    if (rows.size > old || step % 10 === 0) console.log(JSON.stringify(progress.at(-1)));
    if (state.bottom && state.pending === 0 && rows.size > 0) {
      bottomSince ??= Date.now();
      if (Date.now() - lastGrowth > 30000 && progress.filter(p => p.count === rows.size && p.bottom && !p.pending).length >= 6) { complete = true; break; }
    } else if (!state.bottom && step % 12 !== 1) { bottomSince = null; }
    if (Date.now() - lastGrowth > 110000) throw new Error('Stalled before verified end of section');
    if (state.pending && state.pending_y < 150) {
      // Layout shifts can jump past the grid into the tall footer. Return to the
      // FIRST unloaded card; a small bottom nudge never brings it back on screen.
      await page.mouse.wheel(0, state.pending_y - 350);
    } else if (state.pending && state.pending_y < 800) {
      // Keep the unloaded row visible until the lazy loader completes.
      if (step % 8 === 0) await page.mouse.wheel(0, -80);
    } else if (state.bottom && step % 4 === 0) {
      await page.mouse.wheel(0, -350);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 620);
    } else {
      await page.mouse.wheel(0, 620);
    }
    await page.waitForTimeout(2500);
  }
  if (!complete) throw new Error('Scroll limit reached before verified end');
} catch (e) { error = e.message; }
const items = [...rows.values()];
const invalid = items.filter(r => r.currency !== expected || r.current_price == null || !r.thumbnail_url);
const summary = { url, expected_currency: expected, started_at: startedAt, finished_at: new Date().toISOString(), count: items.length, complete, invalid_count: invalid.length, error, progress };
await writeFile(`${output}/games.json`, JSON.stringify(items, null, 2));
await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
await page.screenshot({ path: `${output}/final.png` }).catch(() => {});
await writeFile(`${output}/final.html`, await page.content()).catch(() => {});
await browser.close();
console.log(JSON.stringify({ ...summary, progress: undefined }));
if (!complete || invalid.length) process.exitCode = 1;
