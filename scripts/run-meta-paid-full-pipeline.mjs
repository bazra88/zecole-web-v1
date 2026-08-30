import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-paid");
const batchSize = 100;
const startOffsetValue = Number(process.argv.find((value) => value.startsWith("--start-offset="))?.split("=")[1] || 0);
const requestedEnd = Number(process.argv.find((value) => value.startsWith("--end-offset="))?.split("=")[1] || 0);
if (!Number.isInteger(startOffsetValue) || startOffsetValue < 0 || startOffsetValue % batchSize !== 0) {
  throw new Error("start-offset은 0 이상의 100 단위 정수여야 합니다.");
}
const startOffset = startOffsetValue;
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_ALL_PAID_GAMES");
if (apply && !confirmed) throw new Error("전체 실제 반영에는 --confirm=SYNC_ALL_PAID_GAMES 확인값이 필요합니다.");

function run(script, args = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`, ...args], { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${script} 종료 코드 ${code}`)));
  });
}
const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", start_offset: startOffset, end_offset: null, total: null, completed_batches: 0, processed: 0, updated: 0, failed_offset: null, batches: [], status: "running" };
async function save() { await writeFile(resolve(dataDir, "full-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"); }

try {
  await run("prepare-meta-paid-candidates.mjs", [`--offset=${startOffset}`, `--limit=${batchSize}`]);
  const first = JSON.parse(await readFile(resolve(dataDir, "candidates.json"), "utf8"));
  report.total = first.total;
  const endOffset = requestedEnd > startOffset ? Math.min(requestedEnd, first.total) : first.total;
  report.end_offset = endOffset;
  for (let offset = startOffset; offset < endOffset; offset += batchSize) {
    console.log(`\n===== 유료게임 ${offset + 1}-${Math.min(offset + batchSize, endOffset)} / ${first.total} =====`);
    if (offset !== startOffset) await run("prepare-meta-paid-candidates.mjs", [`--offset=${offset}`, `--limit=${batchSize}`]);
    await run("cache-meta-paid-pages.mjs");
    await run("parse-meta-paid-pages.mjs");
    await run("diff-meta-paid-pages.mjs");
    const syncArgs = apply ? ["--apply", "--confirm=SYNC_PAID_BATCH"] : [];
    await run("sync-meta-paid-pages.mjs", syncArgs);
    const parsed = JSON.parse(await readFile(resolve(dataDir, "parsed.json"), "utf8"));
    const sync = JSON.parse(await readFile(resolve(dataDir, "sync-report.json"), "utf8"));
    report.completed_batches += 1;
    report.processed += parsed.count;
    report.updated += sync.updated;
    report.batches.push({ offset, count: parsed.count, parsed: parsed.parsed, missing: parsed.missing, updated: sync.updated, genre_links: sync.genre_links, unknown_genres: sync.unknown_genres, status: sync.status });
    await save();
  }
  report.status = "complete";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  report.failed_offset = startOffset + report.completed_batches * batchSize;
  await save();
  throw error;
}
await save();
console.log(`\n전체 유료게임 파이프라인 완료: ${report.processed}개 처리, ${report.updated}개 반영`);
