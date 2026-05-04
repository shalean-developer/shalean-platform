import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

export type LocationTitleVariantId = "A" | "B" | "C";

/** First price token from band hint, e.g. "~R450–R1,200+" → "~R450". */
export function extractLeadPriceFromMetaHint(hint: string): string {
  const m = hint.match(/~?R[\d,]+/);
  return m ? m[0].replace(/,/g, "") : "~R380";
}

function clipTitle(raw: string, maxLen = 58): string {
  const t = raw.trim();
  if (t.length <= maxLen) return t;
  const ellipsis = "…";
  return `${t.slice(0, maxLen - ellipsis.length).trimEnd()}${ellipsis}`;
}

/**
 * CTR title templates for Search Console A/B/C testing.
 * Pair with `LOCATION_SEO_FEEDBACK_JSON.titleVariant` per slug (or `defaultTitleVariant`).
 */
export function buildLocationPageMetaTitleForVariant(
  row: CapeTownLocationRow,
  variant: LocationTitleVariantId,
): string {
  const area = row.name.trim();
  const fromPrice = extractLeadPriceFromMetaHint(getLocationMetaPriceHint(row));
  const year = new Date().getFullYear();

  const candidates: Record<LocationTitleVariantId, string> = {
    A: `Cleaning Services ${area} (From ${fromPrice}) | Trusted Local Cleaners | Shalean`,
    B: `Affordable Cleaning Services in ${area} – From ${fromPrice} | Book Today | Shalean`,
    C: `Best Cleaners in ${area} (${year}) | From ${fromPrice} – Book Now | Shalean`,
  };

  return clipTitle(candidates[variant]);
}

/** Preview all three variants (for spreadsheets / GSC experiments). */
export function previewLocationTitleVariants(row: CapeTownLocationRow): Record<LocationTitleVariantId, string> {
  return {
    A: buildLocationPageMetaTitleForVariant(row, "A"),
    B: buildLocationPageMetaTitleForVariant(row, "B"),
    C: buildLocationPageMetaTitleForVariant(row, "C"),
  };
}
