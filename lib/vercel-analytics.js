import "server-only";

const API_URL = "https://api.vercel.com/v1/query/web-analytics/visits/count";

function metric(payload, name) {
  const candidates = [
    payload?.data?.[name],
    payload?.[name],
    payload?.data?.count?.[name],
    payload?.count?.[name],
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value == null ? 0 : Number(value);
}

async function countVisits({ since, until, token, projectId, teamId }) {
  const params = new URLSearchParams({ projectId, since: since.toISOString(), until: until.toISOString() });
  if (teamId) params.set("teamId", teamId);
  const response = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Vercel Analytics 요청 실패 (${response.status})`);
  }
  return { visitors: metric(payload, "visitors"), pageviews: metric(payload, "pageviews") };
}

export async function getVercelAnalyticsSummary() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return { configured: false };

  const until = new Date();
  const since = (days) => new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const [day, week, month] = await Promise.all([
      countVisits({ since: since(1), until, token, projectId, teamId }),
      countVisits({ since: since(7), until, token, projectId, teamId }),
      countVisits({ since: since(30), until, token, projectId, teamId }),
    ]);
    return { configured: true, day, week, month, updatedAt: until.toISOString() };
  } catch (error) {
    return { configured: true, error: error.message || "방문자 통계를 불러오지 못했습니다." };
  }
}
