import type {
  LocationRankingCustomSections,
  LocationRankingTier,
  LocationSeoBlock,
} from "@/lib/seo/capeTownSeoPages";

/** Resolved flags consumed by {@link LocationHubRankingAsset} + `ProgrammaticLocationCleaningPage`. */
export type ResolvedLocationRanking = {
  active: boolean;
  tier: LocationRankingTier;
  useRankingHero: boolean;
  skipLocalAngle: boolean;
  skipDefaultWhyChoose: boolean;
  skipDefaultServicesStrip: boolean;
  skipDefaultAirbnbStrip: boolean;
  prependCostFaq: boolean;
  specialisedCare: boolean;
  apartmentsModule: boolean;
  nearMeParagraph: boolean;
  pricing: boolean;
  serviceList: boolean;
  midInternalLinks: boolean;
  serviceReinforcement: boolean;
  airbnbBoost: boolean;
  trustBullets: boolean;
  ctaBand: boolean;
};

const INACTIVE: ResolvedLocationRanking = {
  active: false,
  tier: "low",
  useRankingHero: false,
  skipLocalAngle: false,
  skipDefaultWhyChoose: false,
  skipDefaultServicesStrip: false,
  skipDefaultAirbnbStrip: false,
  prependCostFaq: false,
  specialisedCare: false,
  apartmentsModule: false,
  nearMeParagraph: false,
  pricing: false,
  serviceList: false,
  midInternalLinks: false,
  serviceReinforcement: false,
  airbnbBoost: false,
  trustBullets: false,
  ctaBand: false,
};

function overlayCustom(
  base: ResolvedLocationRanking,
  custom: LocationRankingCustomSections | undefined,
): ResolvedLocationRanking {
  if (!custom) return base;
  const next = { ...base };
  if (custom.pricing !== undefined) next.pricing = custom.pricing;
  if (custom.localContext !== undefined) next.specialisedCare = custom.localContext;
  if (custom.nearMe !== undefined) next.nearMeParagraph = custom.nearMe;
  if (custom.serviceReinforcement !== undefined) next.serviceReinforcement = custom.serviceReinforcement;
  return next;
}

/**
 * Tier + optional `customSections` → which ranking modules render and which default hub sections to suppress.
 */
export function resolveLocationRankingSections(seo: LocationSeoBlock): ResolvedLocationRanking {
  const tier = seo.tier ?? "low";
  if (tier === "low") {
    return { ...INACTIVE, tier: "low" };
  }

  if (tier === "medium") {
    const base: ResolvedLocationRanking = {
      active: true,
      tier: "medium",
      useRankingHero: false,
      skipLocalAngle: false,
      skipDefaultWhyChoose: false,
      skipDefaultServicesStrip: true,
      skipDefaultAirbnbStrip: false,
      prependCostFaq: false,
      specialisedCare: false,
      apartmentsModule: true,
      nearMeParagraph: true,
      pricing: true,
      serviceList: true,
      midInternalLinks: true,
      serviceReinforcement: false,
      airbnbBoost: false,
      trustBullets: false,
      ctaBand: false,
    };
    return overlayCustom(base, seo.customSections);
  }

  const base: ResolvedLocationRanking = {
    active: true,
    tier: "high",
    useRankingHero: true,
    skipLocalAngle: true,
    skipDefaultWhyChoose: true,
    skipDefaultServicesStrip: true,
    skipDefaultAirbnbStrip: true,
    prependCostFaq: true,
    specialisedCare: true,
    apartmentsModule: seo.hasApartmentFocus !== false,
    nearMeParagraph: true,
    pricing: true,
    serviceList: true,
    midInternalLinks: true,
    serviceReinforcement: true,
    airbnbBoost: true,
    trustBullets: true,
    ctaBand: true,
  };
  return overlayCustom(base, seo.customSections);
}
