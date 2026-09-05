// app/api/admin/thumbnail-backfill/route.js
//
// KRW 백필이 끝난 게임 중 예전 정사각형 아이콘(image_path가 "images/product_35505_"
// 접두어)을 쓰는 게임들을, 메타 스토어가 실제로 보여주는 정확한 썸네일로 조금씩
// 교체하는 엔드포인트. 한 번 호출에 batchSize개만 처리하고 끝난다 — GitHub Actions의
// 스케줄(.github/workflows/thumbnail-backfill-cron.yml)이 몇 분마다 이 엔드포인트를
// 두드려서 조금씩 진행시키는 구조다.
//
// 이미지 추출(app.image[0]["@id"])은 가격과 달리 요청 IP 국가와 무관해서 Vercel에서
// 직접 해도 된다 — lib/meta-collect.mjs 상단 주석 참고. 그래서 서울 클라우드 서버나
// 사용자 컴퓨터 없이도 완전히 자동으로 돌아간다.
//
// 실제 메타스토어 요청은 여기 Vercel 함수 안에서 나가니, GitHub Actions는 그냥
// "지금 한 번 처리해" 신호만 보내는 방아쇠 역할이다 — GitHub 러너 IP가 아니라 Vercel의
// IP로 나가므로 예전에 GitHub 러너 IP가 429를 맞았던 문제와 무관하다.

import { NextResponse } from "next/server";
import { adminRest } from "@/lib/admin-supabase";
import { relayApp, extractBaseInfo, uploadImageToStorage, metaUrlId, sleep } from "@/lib/meta-collect.mjs";

// GitHub Actions의 "5분마다" 스케줄이 실제로는 훨씬 뜸하게(수 시간 간격으로) 도는 것으로
// 확인돼서(2026-09-05), 한 번 호출될 때 최대한 많이 처리하도록 duration/배치 상한을 늘렸다.
export const maxDuration = 280;
export const dynamic = "force-dynamic";

const OLD_ICON_FILTER =
  "image_path=like.images%2Fproduct_35505_*" +
  "&krw_store_available=not.is.null" +
  "&release_date=not.is.null" +
  "&description_long=not.is.null" +
  "&developer=not.is.null" +
  "&supported_languages=not.is.null";

export async function POST(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.IMPORT_API_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 5, 1), 50);
  const delayMs = Math.max(Number(body.delayMs) || 5000, 1000);

  const candidates = await adminRest(`games?select=id,name,meta_product_id,meta_store_url&${OLD_ICON_FILTER}&order=id&limit=${batchSize}`);

  const results = [];
  for (const game of candidates || []) {
    try {
      const metaId = metaUrlId(game.meta_product_id);
      const response = await fetch(game.meta_store_url, {
        headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLEThumbnailBackfill/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`페이지 요청 실패 (${response.status})`);
      const html = await response.text();
      const relay = relayApp(html, metaId);
      const baseInfo = extractBaseInfo(html, relay, metaId);
      if (!baseInfo.imageUrl) throw new Error("이미지 URL을 찾지 못함");

      const imagePath = await uploadImageToStorage({
        imageUrl: baseInfo.imageUrl,
        path: `images/${metaId}.webp`,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
        bucket: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "game-images",
      });
      if (!imagePath) throw new Error("Storage 업로드 실패");

      await adminRest(`games?id=eq.${game.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ image_path: imagePath, source_image_url: baseInfo.imageUrl, updated_at: new Date().toISOString() }),
      });
      results.push({ id: game.id, name: game.name, ok: true, image_path: imagePath });
    } catch (error) {
      results.push({ id: game.id, name: game.name, ok: false, error: error.message });
    }
    await sleep(delayMs);
  }

  const remaining = await adminRest(`games?select=id&${OLD_ICON_FILTER}&limit=1`);

  return NextResponse.json({
    processed: results.length,
    results,
    remaining_exists: Boolean(remaining?.length),
  });
}
