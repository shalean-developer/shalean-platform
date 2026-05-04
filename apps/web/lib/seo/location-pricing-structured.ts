import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { LocationPricingBandId } from "@/lib/seo/location-pricing";

/** Row labels + copy tuned per pricing band for snippet-friendly `<table>` markup. */
export type StructuredHomePricingRow = {
  homeType: string;
  standardCleaning: string;
  deepCleaning: string;
};

export type StructuredPricingBundle = {
  /** Accessible table caption */
  caption: string;
  rows: StructuredHomePricingRow[];
  /** One sentence summarising deep-clean uplift for featured snippets */
  deepCleaningSummary: string;
};

const BY_BAND: Record<LocationPricingBandId, StructuredPricingBundle> = {
  atlantic_premium: {
    caption: "Illustrative Atlantic Seaboard ranges (Sea Point, Fresnaye, Bantry Bay)—confirm your total online.",
    rows: [
      {
        homeType: "Studio / compact apartment",
        standardCleaning: "Roughly R450–R650 for a scoped standard visit",
        deepCleaning: "Roughly R650–R950+ when kitchens & bathrooms need extra dwell time",
      },
      {
        homeType: "2-bedroom apartment",
        standardCleaning: "Roughly R550–R850 depending on bathrooms & add-ons",
        deepCleaning: "Roughly R850–R1,200+ for full wet-area focus & detail zones",
      },
      {
        homeType: "Larger apartment / penthouse",
        standardCleaning: "Roughly R750–R1,100+ for bigger footprints & lifts",
        deepCleaning: "Roughly R950–R1,600+ before heavy oven/fridge extras",
      },
    ],
    deepCleaningSummary:
      "Deep cleaning in premium Atlantic Seaboard apartments typically adds roughly R200–R400+ versus a comparable standard scope because ovens, grout-adjacent work, and bathrooms receive extended time.",
  },
  city_bowl: {
    caption: "Illustrative City Bowl ranges—stairs, parking, and scope still set the final locked quote.",
    rows: [
      {
        homeType: "Bachelor / 1-bed flat",
        standardCleaning: "Roughly R380–R580",
        deepCleaning: "Roughly R580–R850+",
      },
      {
        homeType: "2-bedroom apartment",
        standardCleaning: "Roughly R480–R720",
        deepCleaning: "Roughly R720–R980+",
      },
      {
        homeType: "Townhouse / split-level",
        standardCleaning: "Roughly R580–R850+",
        deepCleaning: "Roughly R850–R1,150+",
      },
    ],
    deepCleaningSummary:
      "Deep visits budget honest time on kitchens and bathrooms—expect a meaningful step up from standard upkeep when those zones have fallen behind.",
  },
  southern_standard: {
    caption: "Southern Suburbs illustrative ranges—family homes and rentals vary by bathrooms & pets.",
    rows: [
      {
        homeType: "Apartment / flat",
        standardCleaning: "Roughly R400–R680",
        deepCleaning: "Roughly R650–R950+",
      },
      {
        homeType: "3-bed family home",
        standardCleaning: "Roughly R550–R880",
        deepCleaning: "Roughly R850–R1,150+",
      },
      {
        homeType: "Large home / dual living",
        standardCleaning: "Roughly R700–R1,050+",
        deepCleaning: "Roughly R1,000–R1,350+ before heavy add-ons",
      },
    ],
    deepCleaningSummary:
      "Deep cleaning scales with bathrooms and kitchen build-up—Southern Suburb quotes jump most when those rooms need restoration-level attention.",
  },
  estate_premium: {
    caption: "Estate & larger-plot homes—ranges widen with entertaining zones and outdoor-adjacent dust.",
    rows: [
      {
        homeType: "Townhouse / cottage",
        standardCleaning: "Roughly R550–R820",
        deepCleaning: "Roughly R820–R1,150+",
      },
      {
        homeType: "4-bed family home",
        standardCleaning: "Roughly R700–R1,050+",
        deepCleaning: "Roughly R1,050–R1,450+",
      },
      {
        homeType: "Large estate layout",
        standardCleaning: "Roughly R850–R1,250+",
        deepCleaning: "Roughly R1,200–R1,700+ depending on scope",
      },
    ],
    deepCleaningSummary:
      "Deep cleans on estate footprints prioritise kitchens, multiple bathrooms, and high-traffic floors—those three drivers usually move the quote more than bedroom count alone.",
  },
  blouberg_coastal: {
    caption: "Blouberg & coastal belt—sand and balcony zones often add mop & vacuum time.",
    rows: [
      {
        homeType: "Apartment",
        standardCleaning: "Roughly R420–R680",
        deepCleaning: "Roughly R680–R980+",
      },
      {
        homeType: "Townhouse",
        standardCleaning: "Roughly R520–R820",
        deepCleaning: "Roughly R820–R1,120+",
      },
      {
        homeType: "Freestanding home",
        standardCleaning: "Roughly R650–R980+",
        deepCleaning: "Roughly R950–R1,320+",
      },
    ],
    deepCleaningSummary:
      "Deep pricing alongside the coast often reflects balcony tracks and grit load—note outdoor-adjacent zones in booking so crews allocate realistic time.",
  },
  northern_standard: {
    caption: "Northern Suburbs illustrative ranges—townhouses and freestanding homes dominate routing.",
    rows: [
      {
        homeType: "Apartment",
        standardCleaning: "Roughly R380–R620",
        deepCleaning: "Roughly R620–R900+",
      },
      {
        homeType: "Townhouse",
        standardCleaning: "Roughly R480–R780",
        deepCleaning: "Roughly R780–R1,050+",
      },
      {
        homeType: "Family house",
        standardCleaning: "Roughly R600–R920+",
        deepCleaning: "Roughly R900–R1,250+",
      },
    ],
    deepCleaningSummary:
      "Northern deep cleans rise fastest when there are multiple full bathrooms and larger kitchens—confirm room counts online so totals stay predictable.",
  },
};

export function getStructuredPricingForLocation(row: CapeTownLocationRow): StructuredPricingBundle {
  return BY_BAND[row.pricingBand];
}
