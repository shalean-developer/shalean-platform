import type { CapeTownLocationSlug } from "@/lib/seo/locations";

export type LocationEditorialOverride = {
  /** Landmarks / anchors mentioned in copy for uniqueness vs other hubs */
  landmarks: string[];
  /** Inserts ahead of generic intro — suburb-specific angle */
  localLead: string;
  /** Optional FAQs merged early into hub FAQ lists (deduped by question stem) */
  extraFaqs?: { q: string; a: string }[];
};

const OVERRIDES: Partial<Record<CapeTownLocationSlug, LocationEditorialOverride>> = {
  "sea-point-cleaning-services": {
    landmarks: ["Sea Point Promenade", "Main Road", "Beach Road"],
    localLead:
      "Sea Point bookings often combine Atlantic Seaboard apartments, Promenade-adjacent walks, and Main Road access patterns—Shalean crews brief for lifts, visitor parking, and salty-air grit that shows up on glass and balconies.",
    extraFaqs: [
      {
        q: "How much does cleaning cost in Sea Point?",
        a: "Most Sea Point jobs land roughly between about R300 and R650 before heavy add-ons—compact apartments skew lower, multi-bathroom homes higher. Lock bedrooms, bathrooms, and extras online so your total matches the home you live in.",
      },
    ],
  },
  "claremont-cleaning-services": {
    landmarks: ["Cavendish Square", "Main Road"],
    localLead:
      "Claremont mixes Southern Suburbs freestanding homes, student-adjacent flats, and retail corridors near Cavendish—routing accounts for Main Road traffic pockets and weekday school-hour congestion.",
    extraFaqs: [
      {
        q: "How much does cleaning cost in Claremont?",
        a: "Claremont quotes typically track Southern Suburbs baselines—often roughly R320–R700 depending on size, bathrooms, and whether you need a maintenance standard clean versus a deeper reset. Confirm scope online for a locked total.",
      },
    ],
  },
  "green-point-cleaning-services": {
    landmarks: ["Green Point Urban Park", "Main Road"],
    localLead:
      "Green Point blends CBD proximity with dense apartment stock—expect stairwells, basement parking, and quick-turn guests around major events; crews align scope with strata realities.",
    extraFaqs: [
      {
        q: "How much does cleaning cost in Green Point?",
        a: "Green Point pricing mirrors Atlantic Seaboard density—studios and one-beds often start lower, while larger doubles or family layouts step up with bathrooms and kitchens driving hours. Use live checkout bands for your exact address.",
      },
    ],
  },
  "rondebosch-cleaning-services": {
    landmarks: ["Rondebosch Common", "Main Road"],
    localLead:
      "Rondebosch spans leafy streets and rental corridors near schools—mud seasons and pet traffic change floor loads; quotes assume realistic bathroom and kitchen time.",
    extraFaqs: [
      {
        q: "How much does cleaning cost in Rondebosch?",
        a: "Expect Southern Suburbs-style bands—often roughly R330–R720 before ovens, fridges, or balcony detail. Larger Edwardian-era layouts may need extra hours; confirm room counts online.",
      },
    ],
  },
  "gardens-cleaning-services": {
    landmarks: ["Company's Garden", "Kloof Street"],
    localLead:
      "The Gardens sits against the mountain with steep access, older lifts, and tight kerbside parking—brief cleaners on boom gates, stairs, and balcony dust off Table Mountain wind.",
    extraFaqs: [
      {
        q: "How much does cleaning cost in the Gardens?",
        a: "City Bowl apartments often price on compact footprints but can run longer on stairs and parking logistics—many visits fall roughly R300–R680 depending on bathrooms and whether balconies are in scope.",
      },
    ],
  },
};

export function getLocationEditorialOverride(slug: string): LocationEditorialOverride | null {
  const row = OVERRIDES[slug as CapeTownLocationSlug];
  return row ?? null;
}
