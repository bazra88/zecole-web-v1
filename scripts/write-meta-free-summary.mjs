import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = process.env.GITHUB_STEP_SUMMARY;
if (!output) throw new Error("GITHUB_STEP_SUMMARY가 설정되지 않았습니다.");

async function readJson(name) {
  try {
    return JSON.parse(await readFile(resolve(root, "data", "meta-free", name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const candidates = await readJson("candidates.json");
const parsed = await readJson("parse-report.json");
const diff = await readJson("diff-report.json");
const sync = await readJson("sync-report.json");

const lines = [
  "## Meta 무료게임 파이프라인 결과",
  "",
  "| 항목 | 결과 |",
  "| --- | ---: |",
  `| 리뷰 500개 이상 후보 | ${candidates?.count ?? "-"}개 |`,
  `| 파싱 성공 | ${parsed?.parsed ?? "-"}/${parsed?.count ?? "-"}개 |`,
  `| DB와 일치 | ${diff?.in_sync ?? "-"}개 |`,
  `| 검토 필요 | ${diff?.review_required ?? "-"}개 |`,
];

if (sync?.mode === "apply") {
  lines.push(
    `| DB 반영 성공 | ${sync.succeeded}/${sync.attempted}개 |`,
    `| DB 반영 실패 | ${sync.failed?.length ?? 0}개 |`,
  );
}

const changed = diff?.rows?.filter((row) => row.status === "review_required") ?? [];
if (changed.length) {
  lines.push("", "### 변경 감지 게임", "");
  for (const row of changed) lines.push(`- ${row.name}: ${row.changes.join(", ")}`);
}

await appendFile(output, `${lines.join("\n")}\n`, "utf8");
console.log("GitHub Actions 실행 요약을 작성했습니다.");
