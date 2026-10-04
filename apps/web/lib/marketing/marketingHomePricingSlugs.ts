import type { MarketingHomeServiceKey } from "@/lib/home/data";

/** Homepage marketing key → checkout catalog slug in `pricing_services`. */
export const MARKETING_TO_PRICING_SLUG: Record<MarketingHomeServiceKey, string> = {
  standard: "standard",
  deep: "deep",
  move: "move",
  airbnb: "airbnb",
  carpet: "carpet",
  office: "office",
};

export function pricingSlugForMarketingKey(key: MarketingHomeServiceKey): string {
  return MARKETING_TO_PRICING_SLUG[key];
}
