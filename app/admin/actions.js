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
