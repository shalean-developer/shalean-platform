import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { LocationPricingBandId } from "@/lib/seo/location-pricing";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

/**
 * First sentence = direct numeric answer (featured-snippet oriented).
 * Band copy aligns with `LOCATION_PRICING_BAND_COPY` meta hints.
 */
const SNIPPET_PRICE_FIRST: Record<LocationPricingBandId, (area: string) => string> = {
  atlantic_premium: (area) =>
    `Cleaning services in ${area} typically cost about R450–R650 for compact apartments and R700–R1,200+ for larger homes or deep cleans.`,
  city_bowl: (area) =>
    `Cleaning services in ${area} typically cost about R380–R550 for smaller flats and R650–R950+ for bigger homes or deep cleans.`,
  southern_standard: (area) =>
    `Cleaning services in ${area} typically cost about R400–R750 for regular upkeep and R650–R1,100+ when kitchens and bathrooms need heavy time.`,
  estate_premium: (area) =>
    `Cleaning services in ${area} typically cost about R550–R950+ for most visits and R1,200–R1,500+ for full-home deep work on large layouts.`,
  blouberg_coastal: (area) =>
    `Cleaning services in ${area} typically cost about R420–R750 for many family scopes and R800–R1,050+ for larger homes or deep resets.`,
  northern_standard: (area) =>
    `Cleaning services in ${area} typically cost about R380–R650 for compact homes and R700–R1,000+ when bathrooms and square metres stack up.`,
};

function supportingPriceSentence(location: CapeTownLocationRow): string {
  const { city } = location;
  const hint = getLocationMetaPriceHint(location);
  return `Your itemised total for ${city} is locked online before you pay (${hint} typical bands)—bedrooms, bathrooms, tier, and add-ons set the final number.`;
}

/**
 * Two sentences: (1) numeric lead ≤ ~28 words, (2) checkout/supporting line.
 */
export function directAnswerHowMuchDoesCleaningCost(location: CapeTownLocationRow): string {
  const band = location.pricingBand as LocationPricingBandId;
  const first = SNIPPET_PRICE_FIRST[band]?.(location.name) ?? SNIPPET_PRICE_FIRST.southern_standard(location.name);
  return `${first} ${supportingPriceSentence(location)}`;
}

/**
 * First sentence states four service lines + entry price band from hub meta hint.
 */
export function directAnswerWhatCleaningServicesAreAvailable(location: CapeTownLocationRow): string {
  const { name, city } = location;
  const hint = getLocationMetaPriceHint(location);
  const first = `In ${name}, book standard, deep, Airbnb, and move-out cleaning—typical planning bands run ${hint} before ovens, fridges, or extra rooms adjust your quote.`;
  const second = `Choose rooms, bathrooms, intensity, and extras online for your ${city} address, then confirm scope before Shalean dispatches a vetted crew.`;
  return `${first} ${second}`;
}
