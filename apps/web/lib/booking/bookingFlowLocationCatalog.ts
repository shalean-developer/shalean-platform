/**
 * URL / marketing hints for the public booking funnel (`BookingFlow`).
 * UUIDs come from `public.locations` on the server via {@link resolveBookingLocationContext}.
 */
export type BookingFlowLocationArea = {
  slug: string;
  name: string;
  citySlug: string;
  cityName: string;
};

export const BOOKING_FLOW_LOCATION_HINTS: readonly BookingFlowLocationArea[] = [
  { slug: "claremont", name: "Claremont", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "sea-point", name: "Sea Point", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "green-point", name: "Green Point", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "camps-bay", name: "Camps Bay", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "constantia", name: "Constantia", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "newlands", name: "Newlands", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "rondebosch", name: "Rondebosch", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "observatory", name: "Observatory", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "salt-river", name: "Salt River", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "woodstock", name: "Woodstock", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "gardens", name: "Gardens", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "tamboerskloof", name: "Tamboerskloof", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "city-bowl", name: "City Bowl", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "cape-town-cbd", name: "Cape Town CBD", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "cape-town", name: "Cape Town", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "bellville", name: "Bellville", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "durbanville", name: "Durbanville", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "brackenfell", name: "Brackenfell", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "century-city", name: "Century City", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "table-view", name: "Table View", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "milnerton", name: "Milnerton", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "bloubergstrand", name: "Bloubergstrand", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "fish-hoek", name: "Fish Hoek", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "muizenberg", name: "Muizenberg", citySlug: "cape-town", cityName: "Cape Town" },
  { slug: "franschhoek", name: "Franschhoek", citySlug: "cape-town", cityName: "Franschhoek" },
] as const;

export const LOCATIONS = BOOKING_FLOW_LOCATION_HINTS;

export function normalizeLocationSlugParam(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

export function findLocationBySlug(slug: string): BookingFlowLocationArea | undefined {
  const s = normalizeLocationSlugParam(slug);
  if (!s) return undefined;
  return BOOKING_FLOW_LOCATION_HINTS.find((l) => l.slug === s);
}

export function findLocationByName(name: string): BookingFlowLocationArea | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return BOOKING_FLOW_LOCATION_HINTS.find((l) => l.name.toLowerCase() === n);
}
