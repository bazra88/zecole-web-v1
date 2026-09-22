import 'server-only';
import { adminRest } from './admin-supabase';
import { relayApp, extractMedia, persistMedia, metaUrlId } from './meta-collect.mjs';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'game-images';
const isSelfHosted = url => typeof url === 'string' && SUPABASE_URL && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`);

// Reuse the visit worker's page response; screenshots and posters stay self-hosted.
export async function ensureGameDetailCached(game, media, { html } = {}) {
  const screenshots = media.filter(item => item.media_type === 'screenshot');
  if (!screenshots.some(item => !isSelfHosted(item.url)) || !html || !SUPABASE_SECRET_KEY) {
    return {media,changed:false};
  }
  const metaId = metaUrlId(game.meta_product_id);
  const raw = extractMedia(relayApp(html,metaId));
  if (!raw.length) return {media,changed:false};
  const stored = await persistMedia(raw,{metaId,supabaseUrl:SUPABASE_URL,supabaseSecretKey:SUPABASE_SECRET_KEY,bucket:BUCKET});
  // Insert first so a failed request cannot erase the existing set.
  await adminRest('game_media?on_conflict=game_id,url',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(stored.map(item=>({game_id:game.id,media_type:item.media_type,url:item.url,
      thumbnail_url:item.thumbnail_url,sort_order:item.sort_order,source:'meta_store'}))),
  });
  const urls = new Set(stored.map(item=>item.url));
  const obsolete = media.filter(item=>item.id && !urls.has(item.url)).map(item=>item.id);
  if (obsolete.length) await adminRest(`game_media?game_id=eq.${game.id}&id=in.(${obsolete.join(',')})`,{method:'DELETE'});
  return {media:stored,changed:true};
}
