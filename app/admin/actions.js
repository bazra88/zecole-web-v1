"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIsConfigured, clearAdminSession, createAdminSession, requireAdmin, verifyAdminPassword } from "@/lib/admin-auth";
import { adminRest } from "@/lib/admin-supabase";
import { inspectMetaStoreUrl } from "@/lib/meta-store-import";

export async function loginAction(_previous, formData) {
  if (!adminIsConfigured()) return { error: "관리자 환경변수를 먼저 설정해 주세요." };
  if (!verifyAdminPassword(formData.get("password"))) return { error: "비밀번호가 올바르지 않습니다." };
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/admin");
}

export async function importGameAction(_previous, formData) {
  try {
    await requireAdmin();
    const game = await inspectMetaStoreUrl(formData.get("meta_store_url"));
    const found = await adminRest(`games?select=id,slug&or=(meta_product_id.eq.${encodeURIComponent(game.metaId)},meta_catalog_item_id.eq.${encodeURIComponent(game.metaId)})&limit=1`);
    const payload = {
      meta_product_id: game.metaId,
      meta_catalog_item_id: game.metaId,
      name: game.name,
      slug: found?.[0]?.slug || game.slug,
      meta_store_url: game.metaStoreUrl,
      source_image_url: game.imageUrl,
      description: game.description,
      developer: game.developer,
      publisher: game.publisher,
      release_date: game.releaseDate,
      rating: game.rating,
      review_count: game.reviewCount,
      current_price: game.currentPrice,
      original_price: game.originalPrice,
      currency: game.currency,
      usd_price: game.currency === "USD" ? game.currentPrice : null,
      krw_price: game.currency === "KRW" ? game.currentPrice : null,
      pricing_type: game.currentPrice === 0 ? "free" : "paid",
      source_status: game.preorder ? "manual_admin:preorder" : "manual_admin:registered",
      active: !game.preorder,
      admin_hidden: false,
      updated_at: new Date().toISOString(),
    };
    if (found?.[0]) {
      await adminRest(`games?id=eq.${found[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    } else {
      await adminRest("games", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    }
    const target = found?.[0] || (await adminRest(`games?meta_product_id=eq.${encodeURIComponent(game.metaId)}&select=id&limit=1`))?.[0];
    if (target?.id && game.genres?.length) {
      for (const name of game.genres) {
        const rows = await adminRest(`genres?name=eq.${encodeURIComponent(name)}&select=id&limit=1`);
        const genre = rows?.[0] || (await adminRest("genres", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name, slug: `meta-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` }),
        }))?.[0];
        if (genre?.id) await adminRest("game_genres?on_conflict=game_id,genre_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ game_id: target.id, genre_id: genre.id }) });
      }
    }
    revalidatePath("/");
    revalidatePath("/games");
    revalidatePath("/admin");
    return { success: `${game.name}을(를) ${found?.[0] ? "갱신" : "등록"}했습니다.` };
  } catch (error) {
    return { error: error.message || "게임 등록에 실패했습니다." };
  }
}

export async function setGameVisibilityAction(formData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const hidden = String(formData.get("hidden")) === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("게임 ID가 올바르지 않습니다.");
  await adminRest(`games?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ admin_hidden: hidden, updated_at: new Date().toISOString() }),
  });
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/admin");
}

export async function updateAffiliateUrlAction(_previousState, formData) {
  try {
    await requireAdmin();
    const id = String(formData.get("id") || "");
    const slug = String(formData.get("slug") || "");
    const affiliateUrl = String(formData.get("affiliate_url") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "게임 ID가 올바르지 않습니다." };
    if (affiliateUrl) {
      const parsed = new URL(affiliateUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) return { error: "http 또는 https 주소만 입력할 수 있습니다." };
    }
    const updated = await adminRest(`games?id=eq.${id}&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ affiliate_url: affiliateUrl || null, updated_at: new Date().toISOString() }),
    });
    if (!updated?.length) return { error: "제휴 링크를 저장할 게임을 찾지 못했습니다." };
    revalidatePath("/");
    revalidatePath("/games");
    if (slug) revalidatePath(`/games/${slug}`);
    revalidatePath("/admin");
    return { success: affiliateUrl ? "제휴 링크를 저장했습니다." : "제휴 링크를 제거했습니다." };
  } catch (error) {
    return { error: error instanceof TypeError ? "올바른 URL을 입력해 주세요." : error.message || "제휴 링크 저장에 실패했습니다." };
  }
}

// youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/ 전부 지원.
function parseYoutubeVideoId(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return null; }
  if (!/(^|\.)youtube\.com$/.test(parsed.hostname) && parsed.hostname !== "youtu.be") return null;
  if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("/")[0] || null;
  if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
  const match = parsed.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
  return match ? match[2] : null;
}

export async function addYoutubeVideoAction(_previousState, formData) {
  try {
    await requireAdmin();
    const id = String(formData.get("id") || "");
    const slug = String(formData.get("slug") || "");
    const rawUrl = String(formData.get("youtube_url") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "게임 ID가 올바르지 않습니다." };
    if (!rawUrl) return { error: "유튜브 링크를 입력해 주세요." };
    const videoId = parseYoutubeVideoId(rawUrl);
    if (!videoId) return { error: "올바른 유튜브 링크가 아닙니다." };

    let title = null;
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { signal: AbortSignal.timeout(8000) });
      if (oembedResponse.ok) {
        const oembed = await oembedResponse.json();
        title = oembed.title || null;
        thumbnailUrl = oembed.thumbnail_url || thumbnailUrl;
      }
    } catch {}

    const inserted = await adminRest("game_videos?on_conflict=game_id,youtube_video_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        game_id: id,
        youtube_video_id: videoId,
        youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        thumbnail_url: thumbnailUrl,
        video_type: "play",
        active: true,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!inserted?.length) return { error: "유튜브 영상을 저장하지 못했습니다." };
    revalidatePath("/");
    revalidatePath("/games");
    if (slug) revalidatePath(`/games/${slug}`);
    revalidatePath("/admin");
    return { success: "유튜브 영상을 추가했습니다." };
  } catch (error) {
    return { error: error.message || "유튜브 영상 추가에 실패했습니다." };
  }
}

export async function deleteYoutubeVideoAction(formData) {
  await requireAdmin();
  const videoRowId = String(formData.get("video_id") || "");
  const slug = String(formData.get("slug") || "");
  if (!/^[0-9a-f-]{36}$/i.test(videoRowId)) throw new Error("영상 ID가 올바르지 않습니다.");
  await adminRest(`game_videos?id=eq.${videoRowId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  revalidatePath("/");
  revalidatePath("/games");
  if (slug) revalidatePath(`/games/${slug}`);
  revalidatePath("/admin");
}

export async function setGameNewReleasePinnedAction(formData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const pinned = String(formData.get("pinned")) === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("게임 ID가 올바르지 않습니다.");
  await adminRest(`games?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_new_release_pinned: pinned,
      ...(pinned ? { active: true, admin_hidden: false } : {}),
      updated_at: new Date().toISOString(),
    }),
  });
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function setGameRecommendationAction(formData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const recommendation = String(formData.get("recommendation") || "");
  const enabled = String(formData.get("enabled")) === "true";
  const fields = {
    beginner: "beginner_recommended",
    advanced: "advanced_recommended",
    zecole: "zecole_recommended",
  };
  const field = fields[recommendation];
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("게임 ID가 올바르지 않습니다.");
  if (!field) throw new Error("추천 단계가 올바르지 않습니다.");

  const updated = await adminRest(`games?id=eq.${id}&select=id`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ [field]: enabled, updated_at: new Date().toISOString() }),
  });
  if (!updated?.length) throw new Error("추천 단계를 저장할 게임을 찾지 못했습니다.");

  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/admin");
}

export async function deleteGameAction(formData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("게임 ID가 올바르지 않습니다.");
  const games = await adminRest(`games?id=eq.${id}&select=id,name&limit=1`);
  const game = games?.[0];
  if (!game) throw new Error("삭제할 게임을 찾지 못했습니다.");
  await adminRest(`horizon_plus_entries?game_id=eq.${id}&external_game_name=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ external_game_name: game.name }),
  });
  const deleted = await adminRest(`games?id=eq.${id}&select=id`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!deleted?.length) throw new Error("게임을 삭제하지 못했습니다.");
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/horizon-plus");
  revalidatePath("/admin");
}
