import { getGameReviews, restSelect } from '@/lib/supabase';

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const gameId = params.get('gameId');
  const page = Number(params.get('page') || 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId || '') || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return Response.json({error:'invalid_request'},{status:400});
  }
  try {
    const {data} = await restSelect('games',{select:'id',id:`eq.${gameId}`,active:'eq.true',admin_hidden:'eq.false'},{revalidate:0});
    if (!data.length) return Response.json({error:'not_found'},{status:404});
    return Response.json(await getGameReviews(gameId,page,{revalidate:0}),{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'unavailable'},{status:503}); }
}
