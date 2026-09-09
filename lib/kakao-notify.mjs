// lib/kakao-notify.mjs
//
// 카카오톡 "나에게 보내기"로 운영 알림(차단 감지 등)을 보낸다(2026-09-09 설정).
// access_token 유효기간이 짧아서(약 6시간) 보낼 때마다 refresh_token으로 새로 발급받고,
// 카카오가 refresh_token 자체를 새로 내려주면 .env.local에 덮어써서 계속 쓸 수 있게 한다
// (refresh_token 유효기간은 약 60일 — 그 안에 최소 한 번은 갱신이 일어나야 계속 살아있음,
// 이 알림 스크립트가 정상적으로 자주 실행되는 한 자동으로 유지됨).

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function loadEnv() {
  try {
    const raw = await readFile(resolve(root, ".env.local"), "utf8");
    return Object.fromEntries(raw.split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function persistRefreshToken(newToken) {
  try {
    const path = resolve(root, ".env.local");
    let content = await readFile(path, "utf8");
    content = /^KAKAO_REFRESH_TOKEN=.*$/m.test(content)
      ? content.replace(/^KAKAO_REFRESH_TOKEN=.*$/m, `KAKAO_REFRESH_TOKEN=${newToken}`)
      : `${content.replace(/\n?$/, "\n")}KAKAO_REFRESH_TOKEN=${newToken}\n`;
    await writeFile(path, content);
  } catch { /* .env.local이 없는 배포 환경이면 그냥 넘어간다(다음 실행에서 다시 시도) */ }
}

async function getAccessToken() {
  const fileEnv = await loadEnv();
  const env = (key) => process.env[key] || fileEnv[key];
  const restApiKey = env("KAKAO_REST_API_KEY");
  const clientSecret = env("KAKAO_CLIENT_SECRET");
  const refreshToken = env("KAKAO_REFRESH_TOKEN");
  if (!restApiKey || !clientSecret || !refreshToken) return null;

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: restApiKey,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (data.refresh_token && data.refresh_token !== refreshToken) await persistRefreshToken(data.refresh_token);
  return data.access_token || null;
}

// 실패해도 예외를 던지지 않는다 — 알림 발송 실패가 정작 알려야 할 원래 작업(차단 감지 등)을
// 막으면 안 된다. 성공 여부만 boolean으로 돌려준다.
export async function sendKakaoNotification(text) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log("[kakao-notify] 카카오 토큰이 설정되지 않아 알림을 건너뜁니다.");
      return false;
    }
    const templateObject = {
      object_type: "text",
      text,
      link: { web_url: "https://zecole.store", mobile_web_url: "https://zecole.store" },
    };
    const response = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.log(`[kakao-notify] 알림 발송 실패: HTTP ${response.status}`);
    return response.ok;
  } catch (error) {
    console.log(`[kakao-notify] 알림 발송 실패: ${error.message}`);
    return false;
  }
}
