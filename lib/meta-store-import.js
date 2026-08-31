import "server-only";
import { chromium } from "playwright";

const first = (value) => Array.isArray(value) ? value[0] : value;
const slugify = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const money = (value) => Number.isFinite(Number(value?.offset_amount)) ? Number(value.offset_amount) / 100 : null;

function jsonLd(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
      const app = graph.find((item) => [item?.["@type"]].flat().includes("SoftwareApplication"));
      if (app) return app;
    } catch {}
  }
  return null;
}

function metaContent(html, property) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tag[0];
    const key = attrs.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property.toLowerCase()) continue;
    return attrs.match(/content=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&") || null;
  }
  const tag = html.match(new RegExp(`<meta[^>]*${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`, "i"))?.[0];
  if (tag) return tag.match(/content=["']([^"']+)["']/i)?.[1]?.replaceAll("&amp;", "&") || null;
  const direct = html.match(new RegExp(`(?:name|property)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*content=["']([^"']+)`, "i"));
  return direct?.[1]?.replaceAll("&amp;", "&") || null;
}

function relayData(html, metaId) {
  let best = null;
  let score = -1;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && String(value.id || "") === metaId) {
      const nextScore = ["display_name", "current_offer", "release_info", "hero_image", "display_long_description"].filter((key) => value[key] != null).length;
      if (nextScore > score) { best = value; score = nextScore; }
    }
    for (const child of Object.values(value)) visit(child);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch {}
  }
  return best;
}

function dateValue(value) {
  if (!value) return null;
  const text = String(value);
  const korean = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return `${korean[1]}-${korean[2].padStart(2, "0")}-${korean[3].padStart(2, "0")}`;
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
}

export async function inspectMetaStoreUrl(rawUrl) {
  let parsedUrl;
  try { parsedUrl = new URL(String(rawUrl || "").trim()); } catch { throw new Error("올바른 Meta 스토어 주소를 입력해 주세요."); }
  if (!/(^|\.)meta\.com$/i.test(parsedUrl.hostname)) throw new Error("meta.com 스토어 주소만 등록할 수 있습니다.");
  const match = parsedUrl.pathname.match(/\/experiences\/(?!section\/)([^/?#]+)\/(\d{6,})\/?/i);
  if (!match) throw new Error("게임 상세 페이지 주소 형식을 확인해 주세요.");
  const [, urlSlug, metaId] = match;
  const locale = parsedUrl.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i)?.[1] || "en-us";
  const storeUrl = `https://www.meta.com/${locale}/experiences/${urlSlug}/${metaId}/`;
  const response = await fetch(storeUrl, { cache: "no-store", headers: {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://www.meta.com/ko-kr/experiences/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
  } });
  let html = await response.text();
  const initialApp = jsonLd(html);
  const initialRelay = relayData(html, metaId);
  if (!(initialApp?.name || initialRelay?.display_name) || !(initialApp?.image || initialApp?.thumbnailUrl || initialRelay?.hero_image || metaContent(html, "og:image"))) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ locale: "ko-KR", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" });
      await page.goto(storeUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2_000);
      html = await page.content();
    } finally {
      await browser.close();
    }
  }
  const app = jsonLd(html);
  const relay = relayData(html, metaId);
  const offer = first(app?.offers) || {};
  const relayOffer = relay?.current_offer || {};
  const name = app?.name || relay?.display_name || metaContent(html, "og:title") || metaContent(html, "twitter:title") || html.match(/<title[^>]*>([^<]+)/i)?.[1]?.replace(/\s*\|.*$/, "").trim();
  const image = first(app?.image || app?.thumbnailUrl);
  const imageUrl = typeof image === "string" ? image : image?.url || relay?.hero_image?.uri || relay?.cover_square_image?.uri || metaContent(html, "og:image") || metaContent(html, "twitter:image") || html.match(/og:image[\s\S]{0,200}?content=["']([^"']+)/i)?.[1]?.replaceAll("&amp;", "&");
  if (!name || !imageUrl) throw new Error("스토어에서 게임명 또는 이미지를 확인하지 못했습니다.");
  const currentPrice = offer.price != null ? Number(offer.price) : money(relayOffer.price);
  const availability = String(offer.availability || "");
  const preorder = /PreOrder/i.test(availability) || Boolean(relay?.pre_order_bundles?.length);
  return {
    metaId,
    slug: slugify(urlSlug || name) || `meta-${metaId}`,
    name: String(name).trim(),
    metaStoreUrl: storeUrl,
    imageUrl,
    description: app?.description || relay?.display_long_description || null,
    developer: first(app?.author)?.name || relay?.developer_name || null,
    publisher: first(app?.publisher)?.name || relay?.publisher_name || null,
    releaseDate: dateValue(app?.datePublished || app?.releaseDate || relay?.release_info?.display_date),
    rating: Number(app?.aggregateRating?.ratingValue || relay?.quality_rating_i18n_score_string) || null,
    reviewCount: Number(app?.aggregateRating?.ratingCount || relay?.quality_rating_count) || null,
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    originalPrice: money(relayOffer.strikethrough_price),
    currency: offer.priceCurrency || relayOffer?.price?.currency || "USD",
    preorder,
  };
}
