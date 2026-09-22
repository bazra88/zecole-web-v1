// scripts/test-discount-scan-headed.mjs
//
// 일회성 진단 스크립트 — GitHub Actions 러너(일반 VM, apt 설치 가능)에서 실제 설치된
// Chromium을 headless와 headed(Xvfb 가상 디스플레이) 두 방식으로 각각 돌려서, 메타
// 할인 목록의 무한스크롤이 몇 개에서 막히는지 비교한다. DB에는 아무것도 쓰지 않는다.
//
// 사용법: xvfb-run -a node scripts/test-discount-scan-headed.mjs

import { chromium } from "playwright";

const TARGET_URL = process.env.TARGET_URL || "https://www.meta.com/ko-kr/experiences/section/28128149733502312/";

async function scrollAndExtract(page) {
  if (!/\/experiences\/section\//.test(page.url())) {
    const seeAllLink = page.locator('a:has-text("모두 보기")').first();
    if (await seeAllLink.count().catch(() => 0)) {
      await seeAllLink.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  const countTiles = () => page.evaluate(() => new Set(
    [...document.querySelectorAll('a[href^="/ko-kr/experiences/"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => /^\/ko-kr\/experiences\/[^/]+\/\d{6,}\/?$/.test(h))
  ).size);

  await page.mouse.move(640, 400);

  let lastCount = await countTiles();
  let stall = 0;
  let giveUpStreak = 0;
  for (let i = 0; i < 260; i++) {
    if (stall > 0 && stall % 3 === 0) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(800);
    }
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(2200);
    const count = await countTiles();
    const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 5);
    if (count > lastCount) { stall = 0; giveUpStreak = 0; lastCount = count; continue; }
    stall += 1;
    if (atBottom) {
      giveUpStreak += 1;
      if (giveUpStreak >= 10) break;
    } else {
      giveUpStreak = 0;
    }
  }

  const debugState = await page.evaluate(() => ({
    scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, innerHeight: window.innerHeight,
  }));

  const count = await countTiles();
  return { count, debug: debugState };
}

async function runOnce(label, headless) {
  console.log(`\n=== ${label} (headless=${headless}) ===`);
  const browser = await chromium.launch({ headless, args: ["--disable-blink-features=AutomationControlled"] });
  try {
    const page = await browser.newPage({
      locale: "en-US",
      viewport: { width: 1280, height: 900 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko", "en-US", "en"] });
      window.chrome = { runtime: {} };
      Object.defineProperty(document, "hidden", { get: () => false });
      Object.defineProperty(document, "visibilityState", { get: () => "visible" });
      document.hasFocus = () => true;
    });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);
    const { count, debug } = await scrollAndExtract(page);
    console.log(`${label} 결과: tileCount=${count}`, debug);
    return count;
  } finally {
    await browser.close();
  }
}

console.log("대상 URL:", TARGET_URL);
try {
  const ipInfo = await fetch("https://ipinfo.io/json").then((r) => r.json());
  console.log("이 러너의 IP 정보:", ipInfo);
} catch (error) {
  console.log("IP 정보 조회 실패:", error.message);
}

await runOnce("headless", true);
await runOnce("headed(Xvfb)", false);
