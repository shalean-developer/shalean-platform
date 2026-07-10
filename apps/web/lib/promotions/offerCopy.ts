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
  return raw.replace(/\/$/, "");
}

export function absoluteCampaignUrl(promo: Pick<PromotionRow, "slug" | "landing_page_path">): string {
  const path = campaignLandingPath(promo);
  if (path.startsWith("http")) return path;
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
