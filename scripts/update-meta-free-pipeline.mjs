import { spawn } from "node:child_process";

const steps = [
  "prepare-meta-free-candidates.mjs",
  "cache-meta-free-pages.mjs",
  "parse-meta-free-pages.mjs",
  "diff-meta-free-pages.mjs",
];

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`scripts/${script}`], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} 종료 코드 ${code}`)));
  });
}

for (const script of steps) {
  console.log(`\n▶ ${script}`);
  await run(script);
}

console.log("\nMeta 무료 게임 파이프라인 갱신 완료 (DB 자동 반영 없음)");
console.log("변경 검토 후 승인 시 npm run data:free:sync -- --apply 를 실행하세요.");
