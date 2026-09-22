import { refreshGameOnVisit } from '@/lib/game-visit-refresh';
import { revalidatePath } from 'next/cache';

export const maxDuration = 60;
export async function POST(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return Response.json({error:'forbidden'},{status:403});
  const { gameId } = await request.json().catch(() => ({}));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId || '')) {
    return Response.json({error:'invalid_game'},{status:400});
  }
  try {
    const result = await refreshGameOnVisit(gameId);
    if (result.changed) {
      revalidatePath('/');
      revalidatePath('/games');
      revalidatePath('/games/[slug]','page');
    }
    return Response.json(result, {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[game-visit]',error.message);
    return Response.json({failed:true},{status:503});
  }
}
