import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data", "meta-paid");
const batchSize = 100;
const batchAttempts = Math.max(1, Number(process.env.META_BATCH_ATTEMPTS || 3));
const batchCooldownMs = Math.max(10_000, Number(process.env.META_BATCH_COOLDOWN_MS || 120_000));
const maxBlockedPerBatch = Math.max(0, Number(process.env.META_MAX_BLOCKED_PER_BATCH || 5));
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
const report = { generated_at: new Date().toISOString(), mode: apply ? "apply" : "dry_run", start_offset: startOffset, end_offset: null, total: null, completed_batches: 0, processed: 0, updated: 0, blocked: 0, failed_offset: null, batches: [], status: "running" };
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
    let parsed;
    let batchDiff;
    let sync;
    let batchUpdated = 0;
    let batchGenreLinks = 0;
    for (let attempt = 1; attempt <= batchAttempts; attempt += 1) {
      if (attempt > 1) {
        const cooldown = batchCooldownMs * (attempt - 1);
        console.log(`배치 누락 재시도 ${attempt}/${batchAttempts}: ${Math.round(cooldown / 1000)}초 대기`);
        await new Promise((resolveWait) => setTimeout(resolveWait, cooldown));
        await run("prepare-meta-paid-candidates.mjs", [`--offset=${offset}`, `--limit=${batchSize}`]);
      }
      await run("cache-meta-paid-pages.mjs");
      await run("parse-meta-paid-pages.mjs");
      await run("diff-meta-paid-pages.mjs");
      const syncArgs = apply ? ["--apply", "--confirm=SYNC_PAID_BATCH"] : [];
      await run("sync-meta-paid-pages.mjs", syncArgs);
      parsed = JSON.parse(await readFile(resolve(dataDir, "parsed.json"), "utf8"));
      batchDiff = JSON.parse(await readFile(resolve(dataDir, "diff-report.json"), "utf8"));
      sync = JSON.parse(await readFile(resolve(dataDir, "sync-report.json"), "utf8"));
      batchUpdated += sync.updated;
      batchGenreLinks += sync.genre_links;
      if (parsed.missing <= maxBlockedPerBatch) break;
    }
    report.completed_batches += 1;
    report.processed += parsed.count;
    report.updated += batchUpdated;
    report.blocked += parsed.missing;
    const blockedGames = parsed.games.filter((game) => game.parse_status === "missing_meta_data").map((game) => ({ id: game.id, name: game.source_name, meta_id: game.meta_id, url: game.meta_store_url }));
    report.batches.push({ offset, count: parsed.count, parsed: parsed.parsed, skipped: parsed.skipped || 0, missing: parsed.missing, blocked: batchDiff.blocked, blocked_games: blockedGames, updated: batchUpdated, genre_links: batchGenreLinks, unknown_genres: sync.unknown_genres, status: parsed.missing ? "incomplete" : sync.status });
    await save();
    if (parsed.missing > maxBlockedPerBatch) console.log(`대량 누락 ${parsed.missing}개가 재시도 후에도 남았습니다. 보류 목록에 기록하고 다음 배치를 계속합니다.`);
    else if (parsed.missing > 0) console.log(`영구 파싱 불가 ${parsed.missing}개는 보류 목록에 기록하고 다음 배치를 계속합니다.`);
  }
  report.status = report.blocked ? "complete_with_blocked" : "complete";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  report.failed_offset = startOffset + report.completed_batches * batchSize;
  await save();
  throw error;
}
await save();
console.log(`\n전체 유료게임 파이프라인 완료: ${report.processed}개 처리, ${report.updated}개 반영, ${report.blocked}개 보류`);
