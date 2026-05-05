/** Deterministic string hash (matches pattern used in `location-hub-authority.ts`). */
export function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

type ServiceLocationVariant = (service: string, location: string) => string;

/** Keyword-forward variants (~70%). */
const SERVICE_LOCATION_VARIANTS: ServiceLocationVariant[] = [
  (s, l) => `${s} in ${l}`,
  (s, l) => `book ${s.toLowerCase()} in ${l}`,
  (s, l) => `${l} ${s.toLowerCase()}`,
  (s, l) => `trusted ${s.toLowerCase()} in ${l}`,
];

/** Conversational anchors (~30%) — reduces templated footprint. */
const SERVICE_LOCATION_NATURAL: ServiceLocationVariant[] = [
  (s, l) => `Get your home cleaned with ${s.toLowerCase()} in ${l}`,
  (s, l) => `Book ${s.toLowerCase()} you can rely on in ${l}`,
  (s, l) => `Local teams for ${s.toLowerCase()} across ${l}`,
];

export function pickServiceLocationAnchor(key: string, service: string, location: string): string {
  const roll = stableHash(`${key}|svc-mix`) % 10;
  if (roll < 3) {
    const idx = stableHash(`${key}|svc-nat`) % SERVICE_LOCATION_NATURAL.length;
    return SERVICE_LOCATION_NATURAL[idx]!(service.trim(), location.trim());
  }
  const idx = stableHash(`${key}|anchor`) % SERVICE_LOCATION_VARIANTS.length;
  return SERVICE_LOCATION_VARIANTS[idx]!(service.trim(), location.trim());
}

type GeoHubVariant = (place: string, city: string) => string;

const GEO_HUB_VARIANTS: GeoHubVariant[] = [
  (place, city) => `cleaning services in ${place}, ${city}`,
  (place, city) => `cleaners in ${place}, ${city}`,
  (place, city) => `home cleaning in ${place}`,
];

const GEO_HUB_NATURAL: ((place: string, city: string) => string)[] = [
  (place) => `Get your home cleaned in ${place}`,
  (place) => `Book a cleaner in ${place}`,
  (place) => `Local cleaners in ${place}`,
  (place, city) => `Trusted home cleaning help in ${place}, ${city}`,
];

/** Sideways hub links — mixes keyword + conversational phrasing deterministically. */
export function pickGeoHubAnchor(key: string, placeName: string, city: string = "Cape Town"): string {
  const roll = stableHash(`${key}|geo-mix`) % 10;
  if (roll < 3) {
    const idx = stableHash(`${key}|geo-nat`) % GEO_HUB_NATURAL.length;
    return GEO_HUB_NATURAL[idx]!(placeName.trim(), city.trim());
  }
  const idx = stableHash(`${key}|geo`) % GEO_HUB_VARIANTS.length;
  return GEO_HUB_VARIANTS[idx]!(placeName.trim(), city.trim());
}

/** Location hub → nearby hub pills (keyword vs natural). */
export function pickNearbyHubAnchor(key: string, placeName: string): string {
  const roll = stableHash(`${key}|nearby-mix`) % 10;
  if (roll < 3) {
    const natural = [
      (p: string) => `Get your home cleaned in ${p}`,
      (p: string) => `Book a cleaner in ${p}`,
      (p: string) => `Local cleaners in ${p}`,
    ];
    return natural[stableHash(`${key}|nearby-nat`) % natural.length]!(placeName.trim());
  }
  return `Cleaning services in ${placeName.trim()}`;
}

const PRICING_BLOG_ANCHORS = [
  "cleaning prices in Cape Town",
  "what cleaning typically costs in Cape Town",
  "Cape Town cleaning prices explained",
  "cleaning quotes and rates in Cape Town",
] as const;

export function pickPricingBlogAnchor(key: string): string {
  const idx = stableHash(`${key}|pricing-blog`) % PRICING_BLOG_ANCHORS.length;
  return PRICING_BLOG_ANCHORS[idx]!;
}
