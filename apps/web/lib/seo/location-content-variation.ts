import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { primaryLocationKeywordPhrase, introContainsPrimaryKeyword } from "@/lib/seo/location-keyword";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

function bandDescriptor(row: CapeTownLocationRow): string {
  switch (row.pricingBand) {
    case "atlantic_premium":
      return "Atlantic Seaboard logistics and coastal wear";
    case "city_bowl":
      return "compact Bowl layouts, stairs, and weekday dust";
    case "southern_standard":
      return "Southern Suburb homes mixing apartments, rentals, and family streets";
    case "estate_premium":
      return "larger plots, entertaining spaces, and canopy-adjacent dust";
    case "blouberg_coastal":
      return "coastal sand, balconies, and open-plan family living";
    case "northern_standard":
      return "Northern Suburb houses and townhouses with practical weekday access";
    default:
      return "local street layouts and weekday routines";
  }
}

function propertyCadence(row: CapeTownLocationRow): string {
  const t = new Set(row.propertyTypes);
  if (t.has("student_share") && t.has("apartment")) {
    return "student flats and compact rentals";
  }
  if (t.has("short_stay")) {
    return "guest-ready apartments and turnovers";
  }
  if (t.has("luxury_home")) {
    return "larger or luxury layouts";
  }
  if (t.has("family_home")) {
    return "family homes and rentals";
  }
  return "local homes";
}

/**
 * Fallback hero intros when `LOCATION_SEO_PAGES.intro` is absent — composed from structured fields only.
 */
export function buildStructuredLocationIntro(row: CapeTownLocationRow): string[] {
  const pk = primaryLocationKeywordPhrase(row);
  const trust =
    "Shalean connects you with vetted, insured cleaners and shows a clear total before you confirm—no surprise surcharges for the scope you select.";
  const band = bandDescriptor(row);
  const props = propertyCadence(row);
  const regionLine =
    row.locationType === "coastal" || row.locationType === "blouberg"
      ? `${row.name} sits in ${row.region}: salt air, lifts, and coastal grit shape realistic scope between visits.`
      : row.locationType === "urban"
        ? `${row.name} is part of Cape Town’s ${row.region}: stairs, parking, and denser layouts mean access notes matter on every job.`
        : `${row.name} is a ${row.region} neighbourhood: ${props}, busy kitchens, and ${band}.`;

  return [
    `${pk} pair transparent online quoting with crews briefed for ${row.city} realities—${regionLine} ${trust}`,
    `Typical scopes in ${row.name} often trend around ${getLocationMetaPriceHint(row)} before add-ons—adjust bedrooms, bathrooms, and extras at checkout so your locked total matches the home you live in.`,
  ];
}

/** Ensure editorial intros lead with the primary keyword phrase when missing. */
export function mergeIntroWithPrimaryKeyword(intro: string[], row: CapeTownLocationRow): string[] {
  if (intro.length === 0) return buildStructuredLocationIntro(row);
  const [first, ...rest] = intro;
  if (introContainsPrimaryKeyword(first, row)) return intro;
  const lead = `${primaryLocationKeywordPhrase(row)}—${first.replace(/^\s*[—–-]\s*/, "").trim()}`;
  return [lead, ...rest];
}
