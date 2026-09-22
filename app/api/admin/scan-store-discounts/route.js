// app/api/admin/scan-store-discounts/route.js
//
// 메타 스토어의 "할인" 목록 페이지(예: Meta Connect 할인 이벤트)를 Vercel(미국 IP)에서
// Playwright로 열어 끝까지 스크롤한 뒤, 보이는 게임의 USD 가격을 우리 DB와 대조한다.
//
// 같은 링크를 한국 IP에서 열면(서울 VPS) 한국 스토어에 실제로 파는 게임만 보이고, 미국
// IP에서 열면 지역락 걸린 게임까지 포함한 더 큰 목록이 보인다(2026-09-23, 사용자가 직접
// 두 IP에서 스캔해서 비교 확인함) — 그래서 이 라우트가 찾아낸 게임 중, 이미
// region_restricted=false로 확정된(=한국 스토어에서 실제로 확인된) 게임은 건드리지 않고,
// 그 외(region_restricted가 true거나 아직 확인 안 된 기존 게임)만 "지역락 게임의 USD
// 가격"으로 갱신한다. 신규 미등록 게임은 여기서 만들지 않는다(범위 밖).
//
// 무한스크롤은 실제 휠 스크롤 이벤트가 있어야 다음 배치가 로딩되고(page.evaluate로 직접
// scrollTo하면 로딩이 멈춘다), 중간에 몇 초간 정지하는 구간이 있어 섣불리 "끝"으로
// 판단하면 안 된다(2026-09-23, 수동 테스트로 확인 — 처음엔 141개에서 멈췄다고 판단했지만
// 실제로는 520개였음). 그래서 "증가 없음"이 여러 번 반복돼도 계속 시도하고, 최종적으로
// scrollY + viewport高이 scrollHeight에 도달했는지까지 확인한다.

import { NextResponse } from "next/server";
import playwright from "playwright-core";
import localPlaywright from "playwright";
import chromium from "@sparticuz/chromium";
import { adminRest } from "@/lib/admin-supabase";

export const maxDuration = 280;
export const dynamic = "force-dynamic";

const DEFAULT_URL = "https://www.meta.com/ko-kr/experiences/view/7186169044832131/";
const metaUrlId = (value) => String(value).split("_").pop();

async function scrollAndExtract(page) {
  // "할인" 탭(view/...) 첫 화면에는 여러 프로모션 섹션이 각자 "모두 보기" 링크를 갖고 있어서,
  // 이미 특정 섹션(section/<id>/) 딥링크로 들어온 경우엔 절대 클릭하면 안 된다 — 페이지 안
  // 다른 위젯의 "모두 보기"를 잘못 눌러서 엉뚱한 목록으로 이동해버린 적이 있었다
  // (2026-09-23, Vercel 실측에서 스크롤 없이 24개만 나오고 scrollHeight도 0으로 깨졌던
  // 원인으로 추정).
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

  // page.mouse.wheel()은 커서의 "현재 위치"에서 휠 이벤트를 쏜다 — move()를 먼저 안 하면
  // 기본 좌표(0,0, 보통 상단 고정 네비게이션 위)에서 이벤트가 발생해서 실제 콘텐츠 그리드의
  // 무한스크롤 로직에 닿지 않는다(2026-09-23, 이게 원인이라 항상 56개에서 멈췄었음).
  await page.mouse.move(640, 400);

  // 스크롤이 이미 현재 로딩된 콘텐츠의 맨 아래에 닿아있으면 "아래로 스크롤"을 계속 보내도
  // 실제 스크롤 위치가 전혀 안 바뀌어서 다음 배치 로딩이 트리거되지 않는다 — 위로 살짝
  // 올렸다가 다시 내리는 "넛지"가 필요하다(2026-09-23, 수동 테스트로 확인한 동작).
  //
  // 사용자가 직접 확인함: 한 화면(4x4=16개)이 로딩되면 그게 화면에 "보이는 채로" 몇 초
  // 머물러야 다음 배치가 로딩되고, 급하게 계속 스크롤만 내리면 로딩 자체가 안 된다 —
  // 그래서 한 번에 조금씩만 내리고(한 화면 분량 정도) 매번 충분히 대기한다(2026-09-23).
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
      if (giveUpStreak >= 10) break; // 넛지를 여러 번 시도해도 그대로면 진짜 끝
    } else {
      giveUpStreak = 0;
    }
  }

  const debugState = await page.evaluate(() => ({
    scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, innerHeight: window.innerHeight,
  }));

  const items = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href^="/ko-kr/experiences/"]')]
      .filter((a) => /^\/ko-kr\/experiences\/[^/]+\/\d{6,}\/?$/.test(a.getAttribute("href")));
    const seen = new Set();
    const results = [];
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (seen.has(href)) continue;
      seen.add(href);
      const match = href.match(/^\/ko-kr\/experiences\/([^/]+)\/(\d+)\/?$/);
      if (match[1] === "view" || match[1] === "section") continue;
      const text = a.textContent.replace(/\s+/g, " ").trim();
      // Vercel(미국 IP)에서는 $, 로컬 테스트 환경 등 다른 IP에서는 다른 통화 기호가 나올 수
      // 있어 기호와 무관하게 숫자만 뽑는다("$19.99", "₩23,100" 등 모두 대응).
      const prices = [...text.matchAll(/[$₩€£]\s?([\d,.]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
      results.push({ slug: match[1], metaId: match[2], currentPrice: prices[0] ?? null, originalPrice: prices[1] ?? null });
    }
    return results;
  });

  return { items, debug: debugState };
}

export async function POST(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.IMPORT_API_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const targetUrl = body.url || DEFAULT_URL;
  const dryRun = Boolean(body.dryRun);

  const browser = process.env.VERCEL
    ? await playwright.chromium.launch({ args: [...chromium.args, "--disable-blink-features=AutomationControlled"], executablePath: await chromium.executablePath(), headless: chromium.headless })
    : await localPlaywright.chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });

  let items, debug;
  try {
    const page = await browser.newPage({ locale: "en-US", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
    // 로컬(한국 IP, 이 세션 내내 메타에 반복 요청한 상태)에서 테스트할 때는 무한스크롤이
    // 56개 근처에서 계속 멈췄다 — isTrusted 휠 이벤트도 실제로 발생하고 스크롤 위치도 진짜
    // 바닥까지 갔는데도 그랬어서, navigator.webdriver 자동화 탐지보다는 이 IP 자체가
    // 그동안의 반복 요청으로 무한스크롤 배치 로딩 쪽에서 조용히 제한된 것으로 보인다
    // (2026-09-23). 아래 지문 위장은 밑져야 본전이라 남겨두되, Vercel(다른 IP)에서 실제로
    // 검증해볼 것.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko", "en-US", "en"] });
      window.chrome = { runtime: {} };
      // 사용자가 직접 확인함: 탭이 실제로 "보이는" 상태로 몇 초 머물러야 다음 배치가 로딩되고,
      // 그냥 스크롤만 빠르게 내리면 로딩이 안 된다 — Page Visibility API 기반으로 백그라운드/
      // 헤드리스 탭의 로딩을 죽이는 것으로 보여서, 항상 "보이는 탭"으로 위장한다(2026-09-23).
      Object.defineProperty(document, "hidden", { get: () => false });
      Object.defineProperty(document, "visibilityState", { get: () => "visible" });
      document.hasFocus = () => true;
    });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1500);
    ({ items, debug } = await scrollAndExtract(page));
  } finally {
    await browser.close();
  }

  // 우리 DB의 기존 게임과 metaId로 대조 — region_restricted=false(한국 스토어에서 실제로
  // 확인된 게임)는 절대 건드리지 않고, 그 외(true 또는 아직 미확인)만 USD로 갱신한다.
  let all = [];
  let offset = 0;
  while (true) {
    const rows = await adminRest(`games?select=id,meta_product_id,region_restricted&limit=1000&offset=${offset}`);
    all = all.concat(rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  const byMetaId = new Map(all.map((g) => [metaUrlId(g.meta_product_id), g]));

  const now = new Date().toISOString();
  let updated = 0;
  let skippedKrConfirmed = 0;
  let unmatched = 0;
  const results = [];
  for (const item of items) {
    if (item.currentPrice == null) continue;
    const game = byMetaId.get(item.metaId);
    if (!game) { unmatched++; continue; }
    if (game.region_restricted === false) { skippedKrConfirmed++; continue; }

    if (dryRun) { updated++; results.push({ metaId: item.metaId, slug: item.slug, currentPrice: item.currentPrice, originalPrice: item.originalPrice }); continue; }

    const patch = {
      current_price: item.currentPrice,
      original_price: item.originalPrice,
      currency: "USD",
      usd_price: item.currentPrice,
      region_restricted: true,
      krw_store_available: false,
      updated_at: now,
    };
    if (item.originalPrice) patch.meta_store_original_price = item.originalPrice;
    await adminRest(`games?id=eq.${game.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });

    const hasDiscount = item.originalPrice && item.originalPrice > item.currentPrice;
    await adminRest("price_history", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        game_id: game.id, current_price: item.currentPrice, original_price: item.originalPrice, currency: "USD",
        discount_percent: hasDiscount ? Math.round((1 - item.currentPrice / item.originalPrice) * 1000) / 10 : null,
        checked_at: now,
      }),
    });
    updated++;
    results.push({ metaId: item.metaId, slug: item.slug, currentPrice: item.currentPrice, originalPrice: item.originalPrice });
  }

  return NextResponse.json({ scanned: items.length, updated, skippedKrConfirmed, unmatched, results, debug });
}
