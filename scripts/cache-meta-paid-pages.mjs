import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const refresh = process.argv.includes("--refresh");
const candidates = JSON.parse(await readFile(resolve(root, "data", "meta-paid", "candidates.json"), "utf8"));
const cacheDir = resolve(root, ".meta-cache", "paid-games");
const exists = (path) => access(path).then(() => true).catch(() => false);
const metaId = (game) => String(game.meta_product_id || game.meta_store_url?.match(/\b\d{10,}\b/)?.[0] || "");
await mkdir(cacheDir, { recursive: true });
const manifest = [];
const queue = [...candidates.games];
const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
  while (queue.length) {
    const game = queue.shift();
    const id = metaId(game);
    const htmlPath = resolve(cacheDir, `${id}.html`);
    if (!id) { manifest.push({ game_id: game.id, name: game.name, status: "invalid_meta_id" }); continue; }
    if (!refresh && await exists(htmlPath)) {
      const html = await readFile(htmlPath, "utf8");
      manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "cached", bytes: Buffer.byteLength(html) });
      continue;
    }
    try {
      const response = await fetch(game.meta_store_url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: {
        Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7", "User-Agent": "Mozilla/5.0 ZECOLECatalog/1.0",
      } });
      const html = await response.text();
      if (!response.ok) { manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: `http_${response.status}` }); continue; }
      await writeFile(htmlPath, html, "utf8");
      manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "fetched", bytes: Buffer.byteLength(html), final_url: response.url });
    } catch (error) { manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "fetch_error", error: error.message }); }
  }
});
await Promise.all(workers);
manifest.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(resolve(cacheDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const failed = manifest.filter((row) => !["fetched", "cached"].includes(row.status));
console.log(`유료게임 Meta HTML: 성공 ${manifest.length - failed.length}/${manifest.length}, 실패 ${failed.length}`);
if (failed.length) console.log("수집 실패 게임은 이번 동기화에서 보류하고 다음 배치를 계속합니다.");
