import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const cacheDir = resolve(root, ".meta-cache", "free-games");
const inputPath = resolve(root, "data", "meta-free", "candidates.json");
const outputDir = resolve(root, "data", "meta-free");
const candidates = JSON.parse(await readFile(inputPath, "utf8"));

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function imageUrl(value) {
  const item = first(value);
  return typeof item === "string" ? item : item?.url || item?.contentUrl || item?.["@id"] || null;
}

function parseLdJson(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of blocks) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => {
        const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        return types.includes("SoftwareApplication");
      });
      if (app) return app;
    } catch {
      // Meta can include malformed JSON-LD blocks; continue to the next block.
    }
  }
  return null;
}

const files = new Set(await readdir(cacheDir));
const rows = [];

for (const candidate of candidates.games) {
  const metaId = String(candidate.meta_store_url).match(/\/experiences\/(?:[^/]+\/)?(\d+)\/?(?:\?|$)/)?.[1];
  const htmlFile = metaId ? `${metaId}.html` : null;
  const html = htmlFile && files.has(htmlFile) ? await readFile(resolve(cacheDir, htmlFile), "utf8") : "";
  const app = html ? parseLdJson(html) : null;
  const aggregate = app?.aggregateRating || {};
  const images = app?.image || app?.thumbnailUrl;
  const row = {
    id: candidate.id,
    source_name: candidate.name,
    meta_id: metaId || null,
    meta_store_url: candidate.meta_store_url,
    title: app?.name || null,
    rating: Number(aggregate.ratingValue) || null,
    review_count: Number(aggregate.ratingCount) || null,
    description: app?.description || null,
    genre: first(app?.applicationSubCategory || app?.applicationCategory) || null,
    supported_devices: Array.isArray(app?.availableOnDevice) ? app.availableOnDevice : [],
    thumbnail_url: imageUrl(images),
    parse_status: app ? "parsed" : "missing_ld_json",
  };
  rows.push(row);
}

const fields = ["id", "source_name", "meta_id", "meta_store_url", "title", "rating", "review_count", "description", "genre", "supported_devices", "thumbnail_url", "parse_status"];
const csvCell = (value) => `"${(Array.isArray(value) ? value.join(" | ") : value ?? "").toString().replaceAll('"', '""')}"`;
const csv = [fields.map(csvCell).join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n");
const missing = rows.filter((row) => row.parse_status !== "parsed");

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "parsed.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), count: rows.length, missing_count: missing.length, games: rows }, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "parsed.csv"), `${csv}\n`, "utf8"),
  writeFile(resolve(outputDir, "parse-report.json"), `${JSON.stringify({ count: rows.length, parsed: rows.length - missing.length, missing: missing.map(({ id, source_name, meta_store_url, parse_status }) => ({ id, source_name, meta_store_url, parse_status })) }, null, 2)}\n`, "utf8"),
]);

console.log(`Meta 필드 파싱 완료: ${rows.length - missing.length}/${rows.length}`);
console.log(`누락 검수 대상: ${missing.length}개`);
console.log(`JSON: ${resolve(outputDir, "parsed.json")}`);
console.log(`CSV:  ${resolve(outputDir, "parsed.csv")}`);
if (missing.length) process.exitCode = 1;
