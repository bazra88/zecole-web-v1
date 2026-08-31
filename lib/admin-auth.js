import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "zecole_admin_session";
const SESSION_SECONDS = 60 * 60 * 8;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(expiresAt) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(String(expiresAt)).digest("hex");
}

export function adminIsConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET && process.env.SUPABASE_SECRET_KEY);
}

export function verifyAdminPassword(password) {
  return adminIsConfigured() && safeEqual(password, process.env.ADMIN_PASSWORD);
}

export async function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signed = signature(expiresAt);
  if (!signed) throw new Error("관리자 세션 환경변수가 설정되지 않았습니다.");
  (await cookies()).set(COOKIE_NAME, `${expiresAt}.${signed}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdmin() {
  const value = (await cookies()).get(COOKIE_NAME)?.value || "";
  const [expiresText, supplied] = value.split(".");
  const expiresAt = Number(expiresText);
  const expected = signature(expiresAt);
  return Boolean(expected && Number.isFinite(expiresAt) && expiresAt > Date.now() / 1000 && safeEqual(supplied, expected));
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("관리자 로그인이 필요합니다.");
}
