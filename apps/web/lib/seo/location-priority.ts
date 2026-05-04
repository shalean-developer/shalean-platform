import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/** Manual boosts for high-query-demand hubs (Search Console / Ads informed). */
const PRIORITY_OVERRIDES: Record<string, number> = {
  "sea-point-cleaning-services": 96,
  "claremont-cleaning-services": 94,
  "green-point-cleaning-services": 93,
  "rondebosch-cleaning-services": 92,
  "gardens-cleaning-services": 91,
  "camps-bay-cleaning-services": 90,
  "durbanville-cleaning-services": 89,
  "constantia-cleaning-services": 88,
  "wynberg-cleaning-services": 87,
  "bellville-cleaning-services": 82,
  "table-view-cleaning-services": 84,
};

function baselinePriority(row: CapeTownLocationRow): number {
  switch (row.locationType) {
    case "coastal":
      return 86;
    case "urban":
      return 83;
    case "estate":
      return 85;
    case "blouberg":
      return 81;
    case "northern":
      return 79;
    case "suburban":
    default:
      return 77;
  }
}

/** 0–100 score: higher hubs receive deeper query-expansion + engagement modules. */
export function getLocationSeoPriority(row: CapeTownLocationRow): number {
  return PRIORITY_OVERRIDES[row.slug] ?? baselinePriority(row);
}

export type HubContentTier = "max" | "strong" | "base";

export function hubContentTierFromPriority(score: number): HubContentTier {
  if (score >= 92) return "max";
  if (score >= 82) return "strong";
  return "base";
}
