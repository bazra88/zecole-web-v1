// app/api/admin/inspect-relay/route.js
//
// 관리자 진단용: 메타스토어 페이지 하나를 즉시 요청해서 relay 객체의 리뷰/미디어 배열이
// 실제로 몇 개씩 들어있는지 확인한다. scripts/sync-meta-recent-krw.mjs의 --inspect
// 플래그와 같은 목적이지만, 로컬(집 회선)이 아니라 Vercel의 IP로 요청했을 때 결과가
// 달라지는지 확인해야 할 때 쓴다(2026-09-09, 리뷰가 페이지당 5개로 고정되는지 로컬
// IP 차단 때문에 생긴 착시인지 구분하기 위해 추가).
import { NextResponse } from "next/server";
import { relayApp } from "@/lib/meta-collect.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.IMPORT_API_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const { metaStoreUrl, metaId } = body;
  if (!metaStoreUrl || !metaId) return NextResponse.json({ error: "metaStoreUrl, metaId가 필요합니다." }, { status: 400 });

  const response = await fetch(metaStoreUrl, {
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6", "User-Agent": "Mozilla/5.0 ZECOLEInspect/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const relay = relayApp(html, String(metaId));

  return NextResponse.json({
    fetchStatus: response.status,
    relayFound: Boolean(relay),
    reviewEdgesCount: relay?.user_reviews2?.edges?.length ?? null,
    reviewObjectKeys: relay?.user_reviews2 ? Object.keys(relay.user_reviews2) : null,
    pageInfo: relay?.user_reviews2?.page_info ?? relay?.user_reviews2?.pageInfo ?? null,
    screenshotsCount: relay?.screenshots?.length ?? null,
  });
}
