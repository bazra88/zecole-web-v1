// scripts/sync-youtube-videos.mjs
//
// ZECOLE 유튜브 채널(기본: @zecole)의 업로드 영상을 긁어서 games.name이 영상 제목에
// 그대로 포함되는지로 매칭한 뒤 game_videos 테이블에 반영한다.
//
// 유튜브 공식 Data API 키가 필요 없다 — 채널의 /videos 페이지 HTML에 내장된
// ytInitialData(각 영상의 id/제목/썸네일)와, 페이지 자체에 공개로 노출되는
// INNERTUBE_API_KEY(모든 방문자에게 노출되는 웹 클라이언트 키, 개인 발급 키가 아님)로
// youtubei/v1/browse continuation 요청을 반복해서 전체 업로드 목록을 가져온다.
// (이미 이 프로젝트의 메타스토어 스크립트들이 쓰는 것과 같은 "공개 페이지 파싱" 방식.)
//
// 매칭 오탐 위험(엉뉼한 게임에 다른 영상이 붙는 것)이 제일 나쁜 결과이므로,
// 항상 dry-run으로 후보를 먼저 리포트에 남기고, --apply일 때만 실제로 반영한다.
// 한 영상 제목에 서로 다른 게임 이름이 여러 개 매칭되면(모호함) 반영하지 않고
// 리포트에만 남긴다 — 자동으로 아무거나 고르지 않는다.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const reportDir = resolve(root, "data", "youtube");
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=SYNC_YOUTUBE_VIDEOS");
if (apply && !confirmed) throw new Error("실제 반영에는 --confirm=SYNC_YOUTUBE_VIDEOS가 필요합니다.");

const arg = (name, fallback) => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return value == null ? fallback : value;
};

const channelHandle = arg("channel", "@zecole");
const maxPages = Math.max(1, Number(arg("max-pages", 20)));
const minNameLength = Math.max(1, Number(arg("min-name-length", 3)));

// --- Supabase 연결 (다른 스크립트들과 동일한 패턴) ---
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(root, ".env.local"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SECRET_KEY;
const key = apply ? secretKey : publicKey;
if (!rawUrl || !key) throw new Error(apply ? "SUPABASE_SECRET_KEY가 필요합니다." : "Supabase 공개 환경변수가 필요합니다.");
const supabaseUrl = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// --- 유튜브 파싱 유틸 ---
const YT_HEADERS = { "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

function findAll(obj, key, results = []) {
  if (!obj || typeof obj !== "object") return results;
  if (Array.isArray(obj)) { for (const item of obj) findAll(item, key, results); return results; }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) results.push(v);
    else findAll(v, key, results);
  }
  return results;
}

// 유튜브 상대시간 표기("6일 전", "2개월 전", "1년 전")를 대략적인 날짜로 변환.
// 정확한 게시일이 필요한 게 아니라 정렬/참고용이라 대략치로 충분하다.
function parseRelativeKoreanTime(text) {
  const match = String(text || "").match(/(\d+)\s*(년|개월|주|일|시간|분)\s*전/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unitMs = { 년: 365 * 86400_000, 개월: 30 * 86400_000, 주: 7 * 86400_000, 일: 86400_000, 시간: 3600_000, 분: 60_000 }[match[2]];
  if (!unitMs) return null;
  return new Date(Date.now() - amount * unitMs).toISOString();
}

function extractVideosFromLockups(data) {
  const lockups = findAll(data, "lockupViewModel").filter((l) => l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO");
  return lockups.map((lockup) => {
    const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
    const thumbnail = sources.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
    const metadataRows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const relativeTimeText = metadataRows.flatMap((row) => row.metadataParts || []).map((part) => part.text?.content).find((text) => /전$/.test(text || ""));
    return {
      video_id: lockup.contentId,
      title: lockup.metadata?.lockupMetadataViewModel?.title?.content || null,
      thumbnail_url: thumbnail,
      published_at: parseRelativeKoreanTime(relativeTimeText),
    };
  }).filter((video) => video.video_id && video.title);
}

async function fetchChannelVideos(handle, maxPages) {
  const initialUrl = `https://www.youtube.com/${handle}/videos`;
  const response = await fetch(initialUrl, { headers: YT_HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`유튜브 채널 페이지 요청 실패 (${response.status}): ${initialUrl}`);
  const html = await response.text();
  const dataMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersionMatch = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/);
  if (!dataMatch || !apiKeyMatch || !clientVersionMatch) {
    throw new Error("채널 페이지에서 필요한 데이터를 찾지 못했습니다 (유튜브 페이지 구조가 바뀌었을 수 있음).");
  }
  const data = JSON.parse(dataMatch[1]);
  const apiKey = apiKeyMatch[1];
  const clientVersion = clientVersionMatch[1];

  const videos = extractVideosFromLockups(data);
  let continuationToken = findAll(data, "richGridRenderer")[0]?.contents?.find((c) => c.continuationItemRenderer)
    ?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;

  let page = 1;
  while (continuationToken && page < maxPages) {
    await sleep(500);
    const browseResponse = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion } }, continuation: continuationToken }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!browseResponse.ok) break;
    const browseData = await browseResponse.json();
    const pageVideos = extractVideosFromLockups(browseData);
    if (!pageVideos.length) break;
    videos.push(...pageVideos);
    continuationToken = findAll(browseData, "continuationCommand")[0]?.token || null;
    page += 1;
  }

  // 채널이 영상 하나를 여러 목록(최신순/인기순 등)에 중복으로 노출할 수 있어 정리한다.
  const seen = new Set();
  return videos.filter((video) => (seen.has(video.video_id) ? false : (seen.add(video.video_id), true)));
}

// --- 매칭 ---
// 공백을 완전히 없애고 이어붙여서 비교하면 "Available"에 "Vail"이, "Battleground"에
// "GRO"가 우연히 포함되는 식의 오탐이 생긴다(2026-09-02 실제 테스트에서 발견). 그래서
// 공백/구두점을 단어 경계로 남겨두고, 게임 이름이 제목 안에서 "독립된 단어(구)"로
// 나타날 때만 매칭한다 — 양쪽에 공백 패딩을 붙여 부분 단어 포함을 막는 트릭.
// 속편 번호를 "BattleGroupVR2"처럼 붙여 쓰기도 하고 "BattleGroupVR 2"처럼 띄어 쓰기도
// 해서(실제로 이 두 표기 차이 때문에 영상이 1편으로 잘못 매칭된 사례 발견, 2026-09-02),
// 글자와 숫자가 바로 붙어있으면 그 사이에도 단어 경계를 넣어 두 표기를 동일하게 취급한다.
const normalize = (text) => ` ${String(text || "")
  .toLowerCase()
  .replace(/(\p{L})(\p{N})/gu, "$1 $2")
  .replace(/(\p{N})(\p{L})/gu, "$1 $2")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()} `;

function matchGames(videoTitle, games) {
  const normalizedTitle = normalize(videoTitle);
  return games.filter((game) => {
    const normalizedName = normalize(game.name);
    return normalizedName.trim().length >= minNameLength && normalizedTitle.includes(normalizedName);
  });
}

// 후속작/짧은 이름 게임 때문에 후보가 여러 개 잡히는 경우가 있다(예: "Contractors Showdown :
// ExfilZone" 안에 더 짧은 게임명 "Contractors"도 단어 경계로 들어있음). 한 후보의 이름이
// 다른 모든 후보 이름을 포함하는 "더 구체적인 이름"이면 그걸로 좁히고, 서로 포함 관계가
// 아닌 진짜 별개의 매칭(예: "Hunt"라는 게임과 무관한 영상 속 "hunt"라는 단어)만 모호함으로 남긴다.
function resolveCandidates(candidates) {
  if (candidates.length <= 1) return candidates;
  const sorted = [...candidates].sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  const longestNorm = normalize(sorted[0].name);
  const allNested = sorted.slice(1).every((game) => longestNorm.includes(normalize(game.name)));
  return allNested ? [sorted[0]] : candidates;
}

// --- 실행 ---
await mkdir(reportDir, { recursive: true });
console.log(`채널 @${channelHandle.replace(/^@/, "")}에서 영상 목록을 가져오는 중...`);
const videos = await fetchChannelVideos(channelHandle, maxPages);
console.log(`영상 ${videos.length}개 수집됨.`);

// Supabase(PostgREST)는 limit을 아무리 크게 줘도 서버 설정상 한 번에 최대 1000행만
// 돌려준다(2026-09-02 실전에서 발견 — 4,962개 중 1,000개만 받아서 "BattleGroupVR2"
// 같은 후반부 게임이 통째로 매칭 후보에서 빠졌었음). offset을 옮겨가며 전부 받는다.
async function fetchAllGames() {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await rest(`games?select=id,name&active=eq.true&admin_hidden=eq.false&order=id.asc&limit=${pageSize}&offset=${offset}`);
    if (!page?.length) break;
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}
const games = await fetchAllGames();
console.log(`매칭 대상 게임 ${games.length}개 로드됨.`);

// 게임 이름이 짧을수록(< 5자) 제목 속 평범한 단어와 우연히 겹칠 위험이 크다
// (실제로 "RUSH"라는 게임이 무관한 영상 속 "Strike Rush"에 오매칭된 사례 발견,
// 2026-09-02). 그런 매칭은 자동 반영하지 않고 별도 검토 목록에만 남긴다.
const matched = [];
const needsReview = [];
const ambiguous = [];
const unmatched = [];
for (const video of videos) {
  const candidates = resolveCandidates(matchGames(video.title, games));
  if (candidates.length === 1) {
    const row = { ...video, game_id: candidates[0].id, game_name: candidates[0].name, short_name_caution: normalize(candidates[0].name).trim().length < 5 };
    (row.short_name_caution ? needsReview : matched).push(row);
  } else if (candidates.length > 1) {
    ambiguous.push({ ...video, candidates: candidates.map((g) => g.name) });
  } else {
    unmatched.push(video);
  }
}

let inserted = 0;
if (apply) {
  for (const item of matched) {
    const payload = {
      game_id: item.game_id,
      youtube_video_id: item.video_id,
      youtube_url: `https://www.youtube.com/watch?v=${item.video_id}`,
      title: item.title,
      thumbnail_url: item.thumbnail_url,
      video_type: "play",
      published_at: item.published_at,
    };
    const result = await rest(`game_videos?on_conflict=game_id,youtube_video_id`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(payload),
    });
    inserted += result?.length || 0;
  }
}

const report = {
  generated_at: new Date().toISOString(),
  mode: apply ? "apply" : "dry_run",
  channel: channelHandle,
  videos_found: videos.length,
  matched: matched.length,
  needs_review: needsReview.length,
  ambiguous: ambiguous.length,
  unmatched: unmatched.length,
  inserted,
  matched_rows: matched,
  needs_review_rows: needsReview,
  ambiguous_rows: ambiguous,
  unmatched_titles: unmatched.map((v) => v.title),
};
await writeFile(resolve(reportDir, "sync-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`매칭 결과 — 확정 ${matched.length} / 검토 필요(짧은 이름, 미반영) ${needsReview.length} / 모호함(미반영) ${ambiguous.length} / 미매칭 ${unmatched.length}${apply ? ` / DB 반영 ${inserted}` : ""}`);
console.log(`리포트: data/youtube/sync-report.json`);
