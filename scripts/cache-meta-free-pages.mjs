import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const refresh = process.argv.includes("--refresh");
const candidatesPath = resolve(root, "data", "meta-free", "candidates.json");
const cacheDir = resolve(root, ".meta-cache", "free-games");
const manifestPath = resolve(cacheDir, "manifest.json");
const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));

await mkdir(cacheDir, { recursive: true });

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const exists = async (path) => access(path).then(() => true).catch(() => false);

function metaId(url) {
  return String(url).match(/\/experiences\/(?:[^/]+\/)?(\d+)\/?(?:\?|$)/)?.[1];
}

const manifest = [];

for (const [index, game] of candidates.games.entries()) {
  const id = metaId(game.meta_store_url);
  if (!id) {
    manifest.push({ game_id: game.id, name: game.name, status: "invalid_url" });
    continue;
  }

  const htmlPath = resolve(cacheDir, `${id}.html`);
  if (!refresh && await exists(htmlPath)) {
    const html = await readFile(htmlPath, "utf8");
    manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: "cached", bytes: Buffer.byteLength(html) });
    continue;
  }

  if (index > 0) await sleep(350);
  const response = await fetch(game.meta_store_url, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (compatible; ZECOLECatalog/1.0; +https://zecolewebv1.vercel.app/)",
    },
  });

  const html = await response.text();
  if (!response.ok) {
    manifest.push({ game_id: game.id, meta_id: id, name: game.name, status: `http_${response.status}` });
    continue;
  }

  await writeFile(htmlPath, html, "utf8");
  manifest.push({
    game_id: game.id,
    meta_id: id,
    name: game.name,
    status: "fetched",
    bytes: Buffer.byteLength(html),
    final_url: response.url,
    fetched_at: new Date().toISOString(),
  });
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const failed = manifest.filter((item) => !["cached", "fetched"].includes(item.status));
console.log(`Meta 원문 ${manifest.length - failed.length}/${manifest.length}개 준비 완료`);
console.log(`신규 수집: ${manifest.filter((item) => item.status === "fetched").length}개`);
console.log(`캐시 재사용: ${manifest.filter((item) => item.status === "cached").length}개`);
console.log(`실패: ${failed.length}개`);
console.log(`Manifest: ${manifestPath}`);

if (failed.length) process.exitCode = 1;
