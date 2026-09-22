// app/api/media/trailer/route.js
//
// 트레일러(mp4, 평균 ~12MB)는 자체 Storage에 저장하지 않는다 — 전부 다운로드하면 용량이
// 수십 GB 단위로 불어나서(2026-09-23 실측), 방문자가 실제로 재생 버튼을 누른 순간에만
// 그 게임의 메타 스토어 페이지를 즉석에서 다시 조회해 그 시점 유효한 링크를 돌려준다.
// 가격(parseKrw)과 달리 미디어 추출은 IP 국가와 무관하다고 검증됐으므로(lib/meta-collect.mjs
// 상단 주석 참고) 서울 VPS를 거칠 필요 없이 Vercel에서 바로 처리한다. 배치처럼 전체를
// 주기적으로 도는 게 아니라 실제 클릭에 비례해서만 메타에 요청이 가므로 훨씬 가볍다.

import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { relayApp, extractMedia, metaUrlId } from "@/lib/meta-collect.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!/^[0-9a-f-]{36}$/i.test(gameId || "")) {
    return NextResponse.json({ error: "게임 ID가 올바르지 않습니다." }, { status: 400 });
  }

  const { data } = await restSelect(
    "games",
    { select: "id,meta_product_id,meta_store_url", id: `eq.${gameId}`, limit: 1 },
    { revalidate: 300 }
  );
  const game = data?.[0];
  if (!game?.meta_store_url) {
    return NextResponse.json({ error: "게임을 찾지 못했습니다." }, { status: 404 });
  }

  try {
    const metaId = metaUrlId(game.meta_product_id);
    const response = await fetch(game.meta_store_url, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
        "User-Agent": "Mozilla/5.0 ZECOLETrailerResolve/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: `메타 스토어 요청 실패 (${response.status})` }, { status: 502 });
    }
    const html = await response.text();
    const relay = relayApp(html, metaId);
    const trailer = extractMedia(relay).find((item) => item.media_type === "trailer");
    if (!trailer?.url) {
      return NextResponse.json({ error: "트레일러를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json(
      { url: trailer.url },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message || "트레일러 조회에 실패했습니다." }, { status: 500 });
  }
}
