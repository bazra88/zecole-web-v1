import { NextResponse } from "next/server";
import { adminRest } from "@/lib/admin-supabase";
import { relayApp, extractMedia } from "@/lib/meta-collect.mjs";
import { metaProductUrl } from "@/lib/game-visit-policy.mjs";
import { reusableTrailer } from "@/lib/meta-fetch-policy.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const reply = (url) => NextResponse.json({url},{headers:{'Cache-Control':'private, no-store'}});

export async function GET(request) {
  const gameId = new URL(request.url).searchParams.get('gameId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId || '')) {
    return NextResponse.json({error:'게임 ID가 올바르지 않습니다.'},{status:400});
  }
  let token;
  let success = false;
  try {
    const [game] = await adminRest(`games?id=eq.${gameId}&active=eq.true&admin_hidden=eq.false&select=id,meta_product_id,meta_store_url`);
    if (!game) return NextResponse.json({error:'게임을 찾지 못했습니다.'},{status:404});
    const media = await adminRest(`game_media?game_id=eq.${gameId}&media_type=eq.trailer&active=eq.true&select=id,url,updated_at&order=updated_at.desc`);
    const cached = media.find(item => reusableTrailer(item));
    if (cached) return reply(cached.url);
    token = await adminRest('rpc/reserve_meta_fetch',{method:'POST',body:JSON.stringify({p_region:'USD',p_game_id:gameId,p_purpose:'trailer'})});
    if (!token) return NextResponse.json({error:'영상 갱신을 잠시 쉬고 있습니다. 잠시 후 다시 시도해 주세요.'},{status:429,headers:{'Retry-After':'3600','Cache-Control':'no-store'}});
    const {id,url} = metaProductUrl(game);
    const response = await fetch(url,{cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(15000),
      headers:{Accept:'text/html','Accept-Language':'ko-KR,ko;q=0.9','User-Agent':'Mozilla/5.0 ZECOLETrailerResolve/1.0'}});
    if (!response.ok) throw new Error(`meta_${response.status}`);
    const relay = relayApp(await response.text(),id);
    if (!relay) throw new Error('missing_relay');
    success = true;
    const trailer = extractMedia(relay).find(item => item.media_type === 'trailer');
    if (!trailer?.url) return NextResponse.json({error:'트레일러를 찾지 못했습니다.'},{status:404});
    if (media[0]) await adminRest(`game_media?id=eq.${media[0].id}`,{method:'PATCH',body:JSON.stringify({url:trailer.url,updated_at:new Date().toISOString()})});
    return reply(trailer.url);
  } catch (error) {
    console.error('[trailer-refresh]',error.message);
    return NextResponse.json({error:'트레일러를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:503});
  } finally {
    if (token) await adminRest(`meta_fetch_attempts?id=eq.${token}`,{method:'PATCH',body:JSON.stringify({success})}).catch(error=>console.error('[meta-fetch-result]',error.message));
  }
}
