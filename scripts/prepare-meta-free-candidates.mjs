import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const thresholdArg = process.argv.find((value) => value.startsWith("--min-reviews="));
const minReviews = Math.max(0, Number(thresholdArg?.split("=")[1] ?? 500) || 500);
const outputDir = resolve(root, "data", "meta-free");

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      })
  );
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

let localEnv = {};
try {
  localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!rawSupabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 필요합니다.");
}

const supabaseUrl = rawSupabaseUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

const fields = ["id", "name", "slug", "review_count", "rating", "pricing_type", "meta_store_url"];
const endpoint = new URL(`${supabaseUrl}/rest/v1/games`);
endpoint.searchParams.set("select", fields.join(","));
endpoint.searchParams.set("active", "eq.true");
endpoint.searchParams.set("pricing_type", "in.(free,free_to_play)");
endpoint.searchParams.set("review_count", `gte.${minReviews}`);
endpoint.searchParams.set("order", "review_count.desc.nullslast,name.asc");

const headers = {
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  Prefer: "count=exact",
};

const pageSize = 1000;
const rows = [];

for (let offset = 0; ; offset += pageSize) {
  const response = await fetch(endpoint, {
    headers: { ...headers, Range: `${offset}-${offset + pageSize - 1}` },
  });

  if (!response.ok) {
    throw new Error(`후보 조회 실패 (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }

  const page = await response.json();
  rows.push(...page);
  if (page.length < pageSize) break;
}

await mkdir(outputDir, { recursive: true });

const generatedAt = new Date().toISOString();
const json = {
  generated_at: generatedAt,
  filters: { pricing_type: ["free", "free_to_play"], min_reviews: minReviews },
  count: rows.length,
  games: rows,
};

const csv = [
  fields.map(csvCell).join(","),
  ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(",")),
].join("\n");

await Promise.all([
  writeFile(resolve(outputDir, "candidates.json"), `${JSON.stringify(json, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDir, "candidates.csv"), `${csv}\n`, "utf8"),
]);

console.log(`무료 게임 후보 ${rows.length}개를 저장했습니다. (리뷰 ${minReviews.toLocaleString("ko-KR")}개 이상)`);
console.log(`JSON: ${resolve(outputDir, "candidates.json")}`);
console.log(`CSV:  ${resolve(outputDir, "candidates.csv")}`);
