import type { DiscountType, PromotionRow } from "./types";

export function formatOfferLabel(args: {
  discountType: DiscountType;
  discountValue: number;
}): string {
  if (args.discountType === "percent") return `${Math.round(args.discountValue)}% OFF`;
  if (args.discountType === "credit") {
    return `R${Math.round(args.discountValue).toLocaleString("en-ZA")} Cleaning Credit`;
  }
  return `R${Math.round(args.discountValue).toLocaleString("en-ZA")} OFF`;
}

export function campaignLandingPath(promo: Pick<PromotionRow, "slug" | "landing_page_path">): string {
  if (promo.landing_page_path?.trim()) return promo.landing_page_path.trim();
  return `/campaigns/${promo.slug}`;
}

export function siteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://shalean.co.za";
  // Never emit shalean.com — www.shalean.com currently 404s and breaks Facebook link clicks.
  return raw
    .replace(/\/$/, "")
    .replace(/^https?:\/\/(www\.)?shalean\.com$/i, "https://shalean.co.za");
}

export function absoluteCampaignUrl(promo: Pick<PromotionRow, "slug" | "landing_page_path">): string {
  const path = campaignLandingPath(promo);
  if (path.startsWith("http")) {
    return path
      .replace(/^https?:\/\/(www\.)?shalean\.com(?=\/|$)/i, "https://shalean.co.za")
      .replace(/\/$/, "");
  }
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Normalize any campaign/booking URL before publishing to social. */
export function canonicalizePublicSiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return `${siteOrigin()}/book`;
  try {
    const u = new URL(trimmed);
    if (/^(www\.)?shalean\.com$/i.test(u.hostname)) {
      u.protocol = "https:";
      u.hostname = "shalean.co.za";
    }
    return u.toString().replace(/\/$/, "") || siteOrigin();
  } catch {
    if (trimmed.startsWith("/")) return `${siteOrigin()}${trimmed}`;
    return `${siteOrigin()}/book`;
  }
}
