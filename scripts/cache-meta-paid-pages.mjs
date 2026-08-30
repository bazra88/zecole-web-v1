import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const refresh = process.argv.includes("--refresh");
const candidates = JSON.parse(await readFile(resolve(root, "data", "meta-paid", "candidates.json"), "utf8"));
const cacheDir = resolve(root, ".meta-cache", "paid-games");
const exists = (path) => access(path).then(() => true).catch(() => false);
const metaId = (game) => String(game.meta_product_id || game.meta_store_url?.match(/\b\d{10,}\b/)?.[0] || "");
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const requestDelayMs = Math.max(500, Number(process.env.META_REQUEST_DELAY_MS || 2000));
const maxAttempts = Math.max(1, Number(process.env.META_FETCH_ATTEMPTS || 4));
const validMetaHtml = (html) => html.length >= 5000
  && /application\/ld\+json/i.test(html)
  && /SoftwareApplication/i.test(html);
await mkdir(cacheDir, { recursive: true });
const manifest = [];
const queue = [...candidates.games];
const workers = Array.from({ length: Math.min(1, queue.length) }, async () => {
  while (queue.length) {
    const game = queue.shift();
    const id = metaId(game);
    const htmlPath = resolve(cacheDir, `${id}.html`);
    if (game.source_status === "official_meta_paid_reviewed") {
      manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "already_reviewed" });
      continue;
    }
    if (!id) { manifest.push({ game_id: game.id, name: game.name, status: "invalid_meta_id" }); continue; }
    if (!refresh && await exists(htmlPath)) {
      const html = await readFile(htmlPath, "utf8");
      if (validMetaHtml(html)) {
        manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "cached", bytes: Buffer.byteLength(html) });
        continue;
      }
      await rm(htmlPath, { force: true });
    }
    let result = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempt > 1) await sleep(Math.min(60_000, 5000 * (2 ** (attempt - 2))));
      await sleep(requestDelayMs + Math.floor(Math.random() * 750));
      try {
        const response = await fetch(game.meta_store_url, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: {
          Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0",
        } });
        const html = await response.text();
        if (response.ok && validMetaHtml(html)) {
          await writeFile(htmlPath, html, "utf8");
          result = { game_id: game.id, meta_id: id, name: game.name, status: "fetched", attempt, bytes: Buffer.byteLength(html), final_url: response.url };
          break;
        }
        result = { game_id: game.id, meta_id: id, name: game.name, status: response.ok ? "invalid_meta_html" : `http_${response.status}`, attempt, bytes: Buffer.byteLength(html) };
      } catch (error) {
        result = { game_id: game.id, meta_id: id, name: game.name, status: "fetch_error", attempt, error: error.message };
      }
    }
    manifest.push(result);
  }
});
await Promise.all(workers);
manifest.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(resolve(cacheDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const skipped = manifest.filter((row) => row.status === "already_reviewed");
const failed = manifest.filter((row) => !["fetched", "cached", "already_reviewed"].includes(row.status));
console.log(`유료게임 Meta HTML: 신규 성공 ${manifest.length - failed.length - skipped.length}, 완료 건너뜀 ${skipped.length}, 실패 ${failed.length}`);
if (failed.length) console.log("수집 실패 게임은 이번 동기화에서 보류하고 다음 배치를 계속합니다.");
