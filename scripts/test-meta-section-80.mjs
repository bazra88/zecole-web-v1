import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const target = 'https://www.meta.com/ko-kr/experiences/section/28128149733502312/';
const out = 'meta-section-test';
await mkdir(out, { recursive: true });
const startedAt = new Date().toISOString();
let region;
try {
  region = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(15000) }).then(r => r.json());
} catch (e) { region = { error: e.message }; }
console.log('RUNNER_REGION', JSON.stringify(region));
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const failures = [];
page.on('requestfailed', r => failures.push({ url: r.url().split('?')[0], error: r.failure()?.errorText }));
page.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url().split('?')[0], status: r.status() }); });
const rows = new Map();
const progress = [];
let error = null;
try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.mouse.move(640, 500);
  let lastGrowth = Date.now();
  for (let step = 0; step < 140; step++) {
    const snapshot = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href]')).flatMap(a => {
        const path = new URL(a.href, location.href).pathname;
        const m = path.match(/\/experiences\/(?:(?!section\/|view\/)([^/]+)\/)?(\d{6,})\/?$/);
        if (!m) return [];
        const text = a.innerText || '';
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        const name = a.querySelector('[data-interactable]')?.textContent?.trim() || lines.find(s => !/^(우수 판매자|높은 평점|Best seller|Top rated)$/i.test(s)) || '';
        const amounts = text.match(/(?:US\$|\$|₩|€|£)\s*[\d,]+(?:\.\d{2})?/g) || [];
        const img = a.querySelector('img');
        return [{ id: m[2], name, price_display: amounts[0] || (/무료|\bFree\b/i.test(text) ? 'Free' : null), original_price_display: a.querySelector('s, del')?.textContent?.trim() || null, currency_symbol: amounts[0]?.match(/US\$|\$|₩|€|£/)?.[0] || null, thumbnail_url: img?.currentSrc || img?.src || null, thumbnail_loaded: !!(img?.complete && img?.naturalWidth), url: a.href, raw_text: text }];
      });
      const scrollables = Array.from(document.querySelectorAll('*')).filter(e => e.scrollHeight > e.clientHeight + 500 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).map(e => ({ tag: e.tagName, id: e.id, top: e.scrollTop, height: e.scrollHeight, client: e.clientHeight }));
      return { cards, position: { y: scrollY, height: document.documentElement.scrollHeight, bodyHeight: document.body.scrollHeight, scrollables } };
    });
    const old = rows.size;
    for (const row of snapshot.cards) if (row.name && row.thumbnail_url) rows.set(row.id, row);
    if (rows.size > old) lastGrowth = Date.now();
    const complete = Array.from(rows.values()).filter(r => r.price_display && r.thumbnail_loaded);
    const entry = { step, count: rows.size, complete: complete.length, ...snapshot.position };
    progress.push(entry);
    if (step % 5 === 0 || rows.size > old) console.log('PROGRESS', JSON.stringify(entry));
    if (step === 0) await page.screenshot({ path: `${out}/initial.png` });
    if (complete.length >= 80) break;
    if (Date.now() - lastGrowth > 75000) { error = 'No new cards for 75 seconds; completeness is not assumed.'; break; }
    await page.mouse.wheel(0, 620);
    await page.waitForTimeout(1800);
    if (step > 0 && step % 12 === 0 && Date.now() - lastGrowth > 12000) {
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(1200);
    }
  }
} catch (e) { error = e.stack; }
const all = Array.from(rows.values());
const selected = all.filter(r => r.price_display && r.thumbnail_loaded).slice(0, 80);
const summary = { started_at: startedAt, collected_at: new Date().toISOString(), target_url: target, execution: 'GitHub Actions ubuntu-latest, headed Chromium via Xvfb', region, observed_count: all.length, exported_count: selected.length, symbols: [...new Set(selected.map(r => r.currency_symbol))], target_reached: selected.length === 80, error, progress, failures };
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
await writeFile(`${out}/games.json`, JSON.stringify(selected, null, 2));
await writeFile(`${out}/all-observed.json`, JSON.stringify(all, null, 2));
const fields = ['id', 'name', 'price_display', 'original_price_display', 'currency_symbol', 'thumbnail_url', 'url'];
const csv = [fields, ...selected.map(r => fields.map(k => r[k] ?? ''))].map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n');
await writeFile(`${out}/games.csv`, '\ufeff' + csv);
await page.screenshot({ path: `${out}/final.png` }).catch(() => {});
await writeFile(`${out}/final.html`, await page.content()).catch(() => {});
console.log('RESULT', JSON.stringify({ ...summary, progress: undefined, failures: failures.slice(0, 10) }));
await browser.close();
if (!summary.target_reached) process.exitCode = 1;
