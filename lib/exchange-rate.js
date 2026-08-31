const USD_KRW_ENDPOINT = "https://api.frankfurter.dev/v2/rate/USD/KRW";

export async function getUsdKrwRate() {
  try {
    const response = await fetch(USD_KRW_ENDPOINT, {
      next: { revalidate: 21600 },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const rate = Number(payload?.rate);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
