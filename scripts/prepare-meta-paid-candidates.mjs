import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const outputDir = resolve(root, "data", "meta-paid");
const limit = Math.min(250, Math.max(1, Number(process.argv.find((v) => v.startsWith("--limit="))?.split("=")[1] || 100)));
const offset = Math.max(0, Number(process.argv.find((v) => v.startsWith("--offset="))?.split("=")[1] || 0));
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!rawUrl || !key) throw new Error("Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const fields = ["id", "meta_product_id", "name", "slug", "meta_store_url", "current_price", "original_price", "currency", "krw_price", "usd_price", "source_image_url", "image_path", "source_status"];
const url = new URL(`${supabaseUrl}/rest/v1/games`);
url.searchParams.set("select", fields.join(","));
url.searchParams.set("active", "eq.true");
url.searchParams.set("pricing_type", "eq.paid");
url.searchParams.set("order", "name.asc");
url.searchParams.set("limit", String(limit));
url.searchParams.set("offset", String(offset));
const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" } });
if (!response.ok) throw new Error(`유료게임 후보 조회 실패: ${response.status} ${await response.text()}`);
const games = await response.json();
const total = Number(response.headers.get("content-range")?.split("/").pop()) || null;
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "candidates.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), offset, limit, total, count: games.length, games }, null, 2)}\n`, "utf8");
console.log(`유료게임 후보 배치: ${offset + 1}-${offset + games.length} / 전체 ${total || "?"}개`);
