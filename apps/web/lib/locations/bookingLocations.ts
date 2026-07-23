import { SEO_LOCATION_COORDS } from "@/lib/locations/seoLocationCoords";

export type BookingLocation = {
  name: string;
  city: string;
  province: string;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
  service_area: boolean;
  equipment_supported: boolean;
};

/** Normalise display name to lookup slug. */
export function bookingLocationSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SLUG_ALIASES: Record<string, string> = {
  "d-urbanvale": "durbanville",
  durbanvale: "durbanville",
  "cape-town-cbd": "cape-town",
  "tableview": "table-view",
  "simons-town": "simons-town",
  "devils-peak-estate": "devils-peak-estate",
};

/** Approximate suburb / town centres for equipment distance fallback. */
const EXTENDED_COORDS: Record<string, { lat: number; lng: number }> = {
  ...SEO_LOCATION_COORDS,
  amandelrug: { lat: -33.874, lng: 18.621 },
  athlone: { lat: -33.967, lng: 18.504 },
  belhar: { lat: -33.917, lng: 18.638 },
  "bellville-south": { lat: -33.915, lng: 18.615 },
  bishopscourt: { lat: -34.026, lng: 18.446 },
  bloubergrant: { lat: -33.825, lng: 18.478 },
  bloubergstrand: { lat: -33.816, lng: 18.484 },
  "bo-kaap": { lat: -33.921, lng: 18.419 },
  bothasig: { lat: -33.872, lng: 18.542 },
  brackenfell: { lat: -33.871, lng: 18.705 },
  brooklyn: { lat: -33.879, lng: 18.564 },
  "cape-gate": { lat: -33.888, lng: 18.515 },
  "cape-town": { lat: -33.924, lng: 18.424 },
  "century-city": { lat: -33.894, lng: 18.507 },
  chempet: { lat: -33.946, lng: 18.562 },
  "city-bowl": { lat: -33.924, lng: 18.424 },
  clareinch: { lat: -33.975, lng: 18.472 },
  clifton: { lat: -33.933, lng: 18.378 },
  clovelly: { lat: -34.152, lng: 18.415 },
  crawford: { lat: -33.978, lng: 18.489 },
  "de-waterkant": { lat: -33.918, lng: 18.418 },
  "devils-peak-estate": { lat: -33.937, lng: 18.422 },
  "diep-river": { lat: -34.021, lng: 18.475 },
  edgemead: { lat: -33.866, lng: 18.547 },
  epping: { lat: -33.913, lng: 18.571 },
  faure: { lat: -34.048, lng: 18.728 },
  firgrove: { lat: -34.071, lng: 18.843 },
  "fish-hoek": { lat: -34.136, lng: 18.433 },
  foreshore: { lat: -33.918, lng: 18.432 },
  george: { lat: -33.961, lng: 22.461 },
  glencairn: { lat: -34.164, lng: 18.432 },
  glosderry: { lat: -33.93, lng: 18.65 },
  goodwood: { lat: -33.904, lng: 18.542 },
  "groote-schuur": { lat: -33.958, lng: 18.465 },
  "harfield-village": { lat: -33.986, lng: 18.462 },
  heathfield: { lat: -34.043, lng: 18.473 },
  helderberg: { lat: -34.076, lng: 18.844 },
  hermanus: { lat: -34.419, lng: 19.234 },
  higgovale: { lat: -33.954, lng: 18.407 },
  "hout-bay": { lat: -34.045, lng: 18.352 },
  "howard-place": { lat: -33.968, lng: 18.498 },
  "kalk-bay": { lat: -34.127, lng: 18.449 },
  kensington: { lat: -33.928, lng: 18.518 },
  kenwyn: { lat: -33.985, lng: 18.492 },
  kirstenhof: { lat: -34.067, lng: 18.448 },
  knysna: { lat: -34.035, lng: 23.049 },
  kommetjie: { lat: -34.14, lng: 18.324 },
  kraaifontein: { lat: -33.848, lng: 18.717 },
  kreupelbosch: { lat: -34.008, lng: 18.468 },
  "kuils-river": { lat: -33.932, lng: 18.742 },
  langebaan: { lat: -33.097, lng: 18.032 },
  lansdowne: { lat: -33.988, lng: 18.512 },
  llandudno: { lat: -34.0, lng: 18.341 },
  "lower-vrede": { lat: -33.935, lng: 18.508 },
  macassar: { lat: -34.044, lng: 18.758 },
  maitland: { lat: -33.918, lng: 18.492 },
  "marconi-beam": { lat: -33.876, lng: 18.548 },
  meadowridge: { lat: -34.034, lng: 18.462 },
  milnerton: { lat: -33.873, lng: 18.512 },
  "monte-vista": { lat: -33.877, lng: 18.592 },
  "mossel-bay": { lat: -34.183, lng: 22.132 },
  "mouille-point": { lat: -33.903, lng: 18.404 },
  mowbray: { lat: -33.952, lng: 18.478 },
  "mutual-park": { lat: -33.968, lng: 18.478 },
  noordhoek: { lat: -34.093, lng: 18.395 },
  "old-oak": { lat: -33.908, lng: 18.618 },
  oranjezicht: { lat: -33.932, lng: 18.41 },
  ottery: { lat: -34.012, lng: 18.512 },
  oudtshoorn: { lat: -33.589, lng: 22.207 },
  "paarden-island": { lat: -33.907, lng: 18.462 },
  paarl: { lat: -33.734, lng: 18.961 },
  panorama: { lat: -33.876, lng: 18.578 },
  "parow-east": { lat: -33.895, lng: 18.608 },
  parow: { lat: -33.899, lng: 18.598 },
  pinelands: { lat: -33.938, lng: 18.518 },
  plattekloof: { lat: -33.857, lng: 18.592 },
  "plettenberg-bay": { lat: -34.053, lng: 23.371 },
  ravensmead: { lat: -33.918, lng: 18.628 },
  retreat: { lat: -34.055, lng: 18.478 },
  rhodes: { lat: -33.948, lng: 18.488 },
  "rondebosch-east": { lat: -33.948, lng: 18.488 },
  scarborough: { lat: -34.197, lng: 18.378 },
  "schotse-kloof": { lat: -33.921, lng: 18.419 },
  "simons-town": { lat: -34.192, lng: 18.432 },
  southfield: { lat: -34.043, lng: 18.492 },
  "st-james": { lat: -34.12, lng: 18.456 },
  steenberg: { lat: -34.068, lng: 18.462 },
  stellenbosch: { lat: -33.935, lng: 18.86 },
  "sun-valley": { lat: -34.108, lng: 18.412 },
  sunnyside: { lat: -33.948, lng: 18.488 },
  "sunset-beach": { lat: -33.824, lng: 18.492 },
  thornton: { lat: -33.918, lng: 18.608 },
  "three-anchor-bay": { lat: -33.912, lng: 18.388 },
  tokai: { lat: -34.064, lng: 18.422 },
  "tyger-valley": { lat: -33.872, lng: 18.632 },
  tygerberg: { lat: -33.878, lng: 18.618 },
  "university-estate": { lat: -33.948, lng: 18.478 },
  "van-riebeeckshof": { lat: -33.848, lng: 18.632 },
  "walmer-estate": { lat: -33.938, lng: 18.468 },
  waterfront: { lat: -33.906, lng: 18.418 },
  welgemoed: { lat: -33.868, lng: 18.618 },
  "west-beach": { lat: -33.808, lng: 18.472 },
  wetton: { lat: -34.008, lng: 18.508 },
  wittebome: { lat: -34.028, lng: 18.478 },
  worcester: { lat: -33.646, lng: 19.444 },
  ysterplaat: { lat: -33.898, lng: 18.512 },
};

const CITY_OVERRIDES: Record<string, string> = {
  George: "George",
  Hermanus: "Hermanus",
  Knysna: "Knysna",
  "Mossel Bay": "Mossel Bay",
  Oudtshoorn: "Oudtshoorn",
  Paarl: "Paarl",
  "Plettenberg Bay": "Plettenberg Bay",
  Stellenbosch: "Stellenbosch",
  Worcester: "Worcester",
  Langebaan: "Langebaan",
};

/** All supported suburb/town names except "Other" — keep sorted alphabetically. */
const BOOKING_LOCATION_NAMES = [
  "Amandelrug",
  "Athlone",
  "Bantry Bay",
  "Belhar",
  "Bellville",
  "Bellville South",
  "Bergvliet",
  "Bishopscourt",
  "Bloubergrant",
  "Bloubergstrand",
  "Bo-Kaap",
  "Bothasig",
  "Brackenfell",
  "Brooklyn",
  "Camps Bay",
  "Cape Gate",
  "Cape Town",
  "Century City",
  "Chempet",
  "City Bowl",
  "Clareinch",
  "Claremont",
  "Clifton",
  "Clovelly",
  "Constantia",
  "Crawford",
  "D'urbanvale",
  "De Waterkant",
  "Devil's Peak Estate",
  "Diep River",
  "Durbanville",
  "Edgemead",
  "Epping",
  "Faure",
  "Firgrove",
  "Fish Hoek",
  "Foreshore",
  "Fresnaye",
  "Gardens",
  "George",
  "Glencairn",
  "Glosderry",
  "Goodwood",
  "Green Point",
  "Groote Schuur",
  "Harfield Village",
  "Heathfield",
  "Helderberg",
  "Hermanus",
  "Higgovale",
  "Hout Bay",
  "Howard Place",
  "Kalk Bay",
  "Kenilworth",
  "Kensington",
  "Kenwyn",
  "Kirstenhof",
  "Knysna",
  "Kommetjie",
  "Kraaifontein",
  "Kreupelbosch",
  "Kuils River",
  "Langebaan",
  "Lansdowne",
  "Llandudno",
  "Lower Vrede",
  "Macassar",
  "Maitland",
  "Marconi Beam",
  "Meadowridge",
  "Milnerton",
  "Monte Vista",
  "Mossel Bay",
  "Mouille Point",
  "Mowbray",
  "Mutual Park",
  "Newlands",
  "Noordhoek",
  "Observatory",
  "Old Oak",
  "Oranjezicht",
  "Ottery",
  "Oudtshoorn",
  "Paarden Island",
  "Paarl",
  "Panorama",
  "Parow",
  "Parow East",
  "Pinelands",
  "Plattekloof",
  "Plettenberg Bay",
  "Plumstead",
  "Ravensmead",
  "Retreat",
  "Rhodes",
  "Rondebosch",
  "Rondebosch East",
  "Rosebank",
  "Salt River",
  "Scarborough",
  "Schotse Kloof",
  "Sea Point",
  "Simon's Town",
  "Southfield",
  "St James",
  "Steenberg",
  "Stellenbosch",
  "Sun Valley",
  "Sunnyside",
  "Sunset Beach",
  "Table View",
  "Tamboerskloof",
  "Thornton",
  "Three Anchor Bay",
  "Tokai",
  "Tyger Valley",
  "Tygerberg",
  "University Estate",
  "Van Riebeeckshof",
  "Vredehoek",
  "Walmer Estate",
  "Waterfront",
  "Welgemoed",
  "West Beach",
  "Wetton",
  "Wittebome",
  "Woodstock",
  "Worcester",
  "Wynberg",
  "Ysterplaat",
  "Zonnebloem",
] as const;

function resolveCoordsForSlug(slug: string): { lat: number; lng: number } | null {
  const key = SLUG_ALIASES[slug] ?? slug;
  return EXTENDED_COORDS[key] ?? null;
}

function buildBookingLocation(name: string): BookingLocation {
  const slug = bookingLocationSlug(name);
  const coords = resolveCoordsForSlug(slug);
  const city = CITY_OVERRIDES[name] ?? "Cape Town";
  const hasCoords = coords !== null;

  return {
    name,
    city,
    province: "Western Cape",
    active: true,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    service_area: true,
    equipment_supported: hasCoords,
  };
}

const OTHER_LOCATION: BookingLocation = {
  name: "Other",
  city: "Cape Town",
  province: "Western Cape",
  active: true,
  latitude: null,
  longitude: null,
  service_area: true,
  equipment_supported: false,
};

const sortedLocations = BOOKING_LOCATION_NAMES.map(buildBookingLocation).sort((a, b) =>
  a.name.localeCompare(b.name, "en-ZA"),
);

export const BOOKING_LOCATIONS: BookingLocation[] = [...sortedLocations, OTHER_LOCATION];

const LOCATION_BY_NORMALISED_NAME = new Map(
  BOOKING_LOCATIONS.map((loc) => [loc.name.trim().toLowerCase(), loc]),
);

export const BOOKING_LOCATION_OPTIONS: string[] = BOOKING_LOCATIONS.filter((l) => l.active).map(
  (l) => l.name,
);

export function getBookingLocationOptions(): string[] {
  return BOOKING_LOCATION_OPTIONS;
}

export function findBookingLocation(locationName: string): BookingLocation | null {
  const key = locationName.trim().toLowerCase();
  if (!key) return null;
  return LOCATION_BY_NORMALISED_NAME.get(key) ?? null;
}

export function isSupportedBookingLocation(locationName: string): boolean {
  const loc = findBookingLocation(locationName);
  return loc !== null && loc.active;
}

/** Fallback centroid for equipment distance when street geocoding fails. Never returns coords for "Other". */
export function getLocationFallbackCoords(
  locationName: string,
): { lat: number; lng: number } | null {
  const trimmed = locationName.trim();
  if (!trimmed || trimmed.toLowerCase() === "other") return null;

  const loc = findBookingLocation(trimmed);
  if (loc?.latitude != null && loc.longitude != null) {
    return { lat: loc.latitude, lng: loc.longitude };
  }

  const slug = bookingLocationSlug(trimmed);
  const coords = resolveCoordsForSlug(slug);
  return coords ? { lat: coords.lat, lng: coords.lng } : null;
}
