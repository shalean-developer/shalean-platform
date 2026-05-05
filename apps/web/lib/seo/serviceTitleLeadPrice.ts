import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";

/**
 * Lead “From …” price tokens for `/services/*` CTR titles (marketing anchors — checkout remains source of truth).
 * Keys are full service slugs.
 */
export const SERVICE_TITLE_LEAD_PRICE: Record<CapeTownSeoServiceSlug, string> = {
  "standard-cleaning-cape-town": "~R250",
  "deep-cleaning-cape-town": "~R500",
  "move-out-cleaning-cape-town": "~R800",
  "airbnb-cleaning-cape-town": "~R350",
  "office-cleaning-cape-town": "~R400",
  "carpet-cleaning-cape-town": "~R450",
  "window-cleaning-cape-town": "~R350",
};

const FALLBACK_LEAD = "~R280";

export function leadPriceForServiceSlug(slug: string): string {
  return SERVICE_TITLE_LEAD_PRICE[slug as CapeTownSeoServiceSlug] ?? FALLBACK_LEAD;
}
