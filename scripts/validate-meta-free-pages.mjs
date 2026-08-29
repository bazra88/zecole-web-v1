import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const candidates = JSON.parse(await readFile(resolve(root, "data", "meta-free", "candidates.json"), "utf8"));
const parsed = JSON.parse(await readFile(resolve(root, "data", "meta-free", "parsed.json"), "utf8"));
const minimumCandidates = Math.max(1, Number(process.env.META_FREE_MIN_CANDIDATES || 10));
const requiredFields = ["title", "rating", "review_count", "description", "thumbnail_url"];

const problems = [];
if (candidates.count < minimumCandidates) {
  problems.push(`후보 수가 안전 기준보다 적습니다: ${candidates.count}/${minimumCandidates}`);
}
if (parsed.count !== candidates.count) {
  problems.push(`후보/파싱 수가 다릅니다: ${candidates.count}/${parsed.count}`);
}
if (parsed.missing_count) {
  problems.push(`JSON-LD 파싱 실패가 있습니다: ${parsed.missing_count}개`);
}

for (const game of parsed.games) {
  const missing = requiredFields.filter((field) => game[field] == null || game[field] === "");
  if (missing.length) problems.push(`${game.source_name}: ${missing.join(", ")} 누락`);
  if (Number(game.review_count) < 500) problems.push(`${game.source_name}: 리뷰 수 500개 미만`);
}

if (problems.length) {
  console.error("Meta 무료게임 품질 검증 실패");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`품질 검증 통과: ${parsed.count}개 게임, 필수 필드 및 리뷰 기준 정상`);
