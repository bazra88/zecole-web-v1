import "server-only";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SECRET_KEY;

export async function adminRest(path, options = {}) {
  if (!url || !key) throw new Error("Supabase 서버 환경변수가 설정되지 않았습니다.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase 요청 실패 (${response.status}): ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}
