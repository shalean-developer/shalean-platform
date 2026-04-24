import { LOCATIONS } from "@/lib/locations";

export const SERVICE_CITIES = [
  { slug: "cape-town", name: "Cape Town" },
  { slug: "johannesburg", name: "Johannesburg" },
] as const;

export const SERVICE_LOCATIONS = LOCATIONS;

export function locationNameFromSlug(slug: string): string | null {
  const match = SERVICE_LOCATIONS.find((loc) => loc.slug === slug);
  return match?.name ?? null;
}

export function cityNameFromSlug(slug: string): string | null {
  const match = SERVICE_CITIES.find((city) => city.slug === slug);
  return match?.name ?? null;
}

export function locationNameForCity(citySlug: string, locationSlug: string): string | null {
  const match = SERVICE_LOCATIONS.find((loc) => loc.citySlug === citySlug && loc.slug === locationSlug);
  return match?.name ?? null;
}
