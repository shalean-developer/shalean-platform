import { stableHash } from "@/lib/seo/anchorVariants";

const STANDARD_CLEANING_MONEY_VARIANTS = [
  {
    before: "Looking for reliable",
    anchor: "home cleaning services in Cape Town",
    after:
      "? Book vetted cleaners with transparent pricing and same-day availability when slots open.",
  },
  {
    before: "Need",
    anchor: "professional cleaners in Cape Town",
    after:
      "? Book online with upfront pricing—your address locks scope before we dispatch.",
  },
  {
    before: "Prefer insured crews for",
    anchor: "house cleaning services in Cape Town",
    after:
      "? Compare scope online, then confirm with suburb-aware quoting before checkout.",
  },
] as const;

/** Early in-body link to the standard-cleaning money page; anchor rotates deterministically per hub. */
export function getLocationHubStandardCleaningMoneyParagraph(hubSlug: string): (typeof STANDARD_CLEANING_MONEY_VARIANTS)[number] {
  const idx = stableHash(`${hubSlug}|money-inbody`) % STANDARD_CLEANING_MONEY_VARIANTS.length;
  return STANDARD_CLEANING_MONEY_VARIANTS[idx]!;
}

const PEER_CONTEXT_LINES: Record<string, string> = {
  "bantry-bay-cleaning-services": "Cliff-side homes with wind-blown decks and glass-heavy living spaces.",
  "bergvliet-cleaning-services": "Green-belt adjacent homes where garden dust and school-week traffic add up.",
  "camps-bay-cleaning-services": "Wind-exposed patios and apartments that need careful detailing.",
  "claremont-cleaning-services": "Popular for family homes and rentals near schools.",
  "constantia-cleaning-services": "Larger plots, estate access, and kitchens that work hard between visits.",
  "durbanville-cleaning-services": "Northern suburban homes with bigger floor plans and driveway parking.",
  "bellville-cleaning-services": "Northern corridor homes, townhouses, and steady rental turnover.",
  "fresnaye-cleaning-services": "Quiet Seaboard streets with split-level layouts and tight access notes.",
  "gardens-cleaning-services": "Heritage walk-ups and City Bowl flats—stairs and festival-week dust.",
  "green-point-cleaning-services": "Ideal for Seaboard apartments and Airbnb turnovers.",
  "kenilworth-cleaning-services": "Southern Suburbs homes balancing gardens, pets, and busy kitchens.",
  "newlands-cleaning-services": "Garden-lined streets and larger family kitchens.",
  "observatory-cleaning-services": "Compact flats and busy streets near Main Road.",
  "plumstead-cleaning-services": "Family homes with mature gardens and school-run intensity.",
  "rondebosch-cleaning-services": "Leafy suburban homes and student-adjacent clusters.",
  "rosebank-cleaning-services": "Southern Suburbs pockets where rentals and family homes sit side by side.",
  "sea-point-cleaning-services": "Atlantic Seaboard flats, balconies, and guest-ready turnovers.",
  "table-view-cleaning-services": "Blouberg-adjacent homes with beach grit and family traffic.",
  "tamboerskloof-cleaning-services": "Victorian terraces and hillside apartments below Signal Hill.",
  "vredehoek-cleaning-services": "Bowl-side apartments with stairs, wind, and tight parking.",
  "woodstock-cleaning-services": "Creative-quarter apartments and loft conversions.",
  "wynberg-cleaning-services": "Southern Suburbs homes where passages and kitchens see daily wear.",
  "zonnebloem-cleaning-services": "CBD-adjacent apartments with lifts and rapid turnovers.",
};

/** One-line context for “nearby hub” lists (peer slug → teaser). */
export function getLocationHubPeerContextLine(peerSlug: string): string {
  return PEER_CONTEXT_LINES[peerSlug] ?? "Same Cape Town-wide guides with suburb-aware scope at checkout.";
}
