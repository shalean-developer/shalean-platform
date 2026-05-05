import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { generateCtrTitle } from "@/lib/seo/metaTitle";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

export type LocationTitleVariantId = "A" | "B" | "C";

/** First price token from band hint, e.g. "~R450–R1,200+" → "~R450". */
export function extractLeadPriceFromMetaHint(hint: string): string {
  const m = hint.match(/~?R[\d,]+/);
  return m ? m[0].replace(/,/g, "") : "~R380";
}

/**
 * CTR `<title>` with deterministic structural rotation + band-aware lead price.
 * Pair with `LOCATION_SEO_FEEDBACK_JSON.titleVariant` per slug (`templateKey` suffix shifts hash).
 */
export function buildLocationPageMetaTitleForVariant(
  row: CapeTownLocationRow,
  variant: LocationTitleVariantId,
): string {
  const fromPrice = extractLeadPriceFromMetaHint(getLocationMetaPriceHint(row));
  return generateCtrTitle({
    base: "Home Cleaning Services",
    place: `${row.name.trim()}, ${row.city.trim()}`,
    fromPrice,
    templateKey: `${row.slug}|${variant}`,
    brandSuffix: "Shalean",
    pageIntent: "location",
  });
}

/** Preview all three variants (for spreadsheets / GSC experiments). */
export function previewLocationTitleVariants(row: CapeTownLocationRow): Record<LocationTitleVariantId, string> {
  return {
    A: buildLocationPageMetaTitleForVariant(row, "A"),
    B: buildLocationPageMetaTitleForVariant(row, "B"),
    C: buildLocationPageMetaTitleForVariant(row, "C"),
  };
}
