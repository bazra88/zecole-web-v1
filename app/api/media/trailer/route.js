import { NextResponse } from 'next/server';
import { adminRest } from '@/lib/admin-supabase';
import { isBotUserAgent } from '@/lib/bot-detect.mjs';
import { needsMediaRenewal } from '@/lib/shared-media-policy.mjs';
import { refreshGameOnVisit, getVisitRefreshStatus } from '@/lib/game-visit-refresh';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { refreshReviewTranslations } from '@/lib/game-review-refresh';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const reply = (body,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request) {
  const gameId = new URL(request.url).searchParams.get('gameId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId||'')) return reply({error:'invalid_game'},400);
  if (isBotUserAgent(request.headers.get('user-agent'))) return reply({error:'forbidden'},403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({error:'forbidden'},403);
  try {
    const [game] = await adminRest(`games?id=eq.${gameId}&active=eq.true&admin_hidden=eq.false&select=id`);
    if (!game) return reply({error:'not_found'},404);
    const read = () => adminRest(`game_media?game_id=eq.${gameId}&media_type=eq.trailer&active=eq.true&select=url,updated_at&order=updated_at.desc`);
    const usable = rows => rows.find(m=>/^https:\/\//.test(m.url||'')&&!needsMediaRenewal(m.url));
    let trailer=usable(await read());
    if (trailer) return reply({url:trailer.url});
    // Waiters only read the shared result; they must never claim another fetch.
    if (new URL(request.url).searchParams.get('cacheOnly') === '1') {
      const state=await getVisitRefreshStatus(gameId);
      return reply({pending:state.pending},state.pending?202:503);
    }
    const result=await refreshGameOnVisit(gameId,{mediaOnly:true});
    if(result.reviews?.length) after(async()=>{
      try { await refreshReviewTranslations(gameId,result.reviews); }
      catch(error) { console.error('[review-refresh]',error.message); }
    });
    if(result.changed) {
      revalidatePath('/games/[slug]','page'); revalidatePath('/games'); revalidatePath('/');
    }
    trailer=usable(await read());
    if(trailer) return reply({url:trailer.url});
    return reply({pending:Boolean(result.pending),error:'영상 주소를 갱신하지 못했습니다. 잠시 후 다시 확인해 주세요.'},result.pending?202:503);
  } catch(error) {
    console.error('[trailer-refresh]',error.message);
    return reply({error:'트레일러를 불러오지 못했습니다.'},503);
  }
}
