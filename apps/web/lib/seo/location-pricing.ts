/** Indexed by `pricingBand` from `location-hubs.json`. */
export const LOCATION_PRICING_BAND_COPY = {
  atlantic_premium: {
    metaHint: "~R450–R1,200+",
    faqRange:
      "Atlantic Seaboard visits usually land between roughly R450 for compact scopes and R1,200+ for larger homes or deeper resets—final totals depend on bedrooms, bathrooms, and add-ons at checkout.",
    heroLine:
      "Atlantic Seaboard pricing reflects lifts, parking logistics, and coastal wear—many apartments start around R450–R650; larger homes or deeper scopes scale up from there.",
  },
  city_bowl: {
    metaHint: "~R380–R950+",
    faqRange:
      "City Bowl flats often quote from roughly R380–R550 for tighter scopes, while multi-room homes or deeper cleans move toward R650–R950+ depending on layout and extras.",
    heroLine:
      "Compact Bowl layouts keep entry scopes efficient; stairs, parking, and extras still move the quote—most flats land roughly R380–R650 before add-ons.",
  },
  southern_standard: {
    metaHint: "~R400–R1,100+",
    faqRange:
      "Southern Suburb homes typically span roughly R400–R750 for regular upkeep scopes and R650–R1,100+ when kitchens, bathrooms, and floors need more time—confirmed online before payment.",
    heroLine:
      "Family homes and rentals here mix apartments with larger plots—many bookings fall roughly R400–R850 depending on rooms, pets, and garden-adjacent dust.",
  },
  estate_premium: {
    metaHint: "~R550–R1,500+",
    faqRange:
      "Larger plots and entertainment-heavy layouts mean scoped time adds up—estate visits often start around R550–R850 for focused rounds and can exceed R1,200–R1,500+ for full-home deep work.",
    heroLine:
      "Constantia-scale homes need honest scope for floors, kitchens, and outdoor-adjacent dust—expect many visits roughly R550–R950+ before heavy deep extras.",
  },
  blouberg_coastal: {
    metaHint: "~R420–R1,050+",
    faqRange:
      "Blouberg coastal homes balance sand, balconies, and open-plan living—many scopes land roughly R420–R750, with larger houses or deep resets trending R800–R1,050+.",
    heroLine:
      "Beach-day grit and balcony tracks add mop and vacuum time—typical family scopes often fall roughly R420–R850 depending on size and service tier.",
  },
  northern_standard: {
    metaHint: "~R380–R1,000+",
    faqRange:
      "Northern Suburb houses and townhouses often quote roughly R380–R650 for compact scopes and R700–R1,000+ when multiple bathrooms and larger footprints need time.",
    heroLine:
      "Mix of rentals and family homes keeps scopes varied—many visits land roughly R400–R850 before move-out or deep-intensity add-ons.",
  },
} as const;

export type LocationPricingBandId = keyof typeof LOCATION_PRICING_BAND_COPY;

export type PricingBandLocator = { pricingBand: LocationPricingBandId };

export function getLocationMetaPriceHint(row: PricingBandLocator): string {
  return LOCATION_PRICING_BAND_COPY[row.pricingBand].metaHint;
}

export function getLocationPricingFaqRange(row: PricingBandLocator): string {
  return LOCATION_PRICING_BAND_COPY[row.pricingBand].faqRange;
}

export function getLocationPricingHeroLine(row: PricingBandLocator): string {
  return LOCATION_PRICING_BAND_COPY[row.pricingBand].heroLine;
}
