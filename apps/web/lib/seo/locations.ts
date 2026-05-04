/**
 * Programmatic location helpers — catalogue lives in `capeTownLocations.ts`.
 *
 * `nearby`: short area keys — normalized to `{key}-cleaning-services` and only emitted when that hub exists.
 */
import {
  CAPE_TOWN_LOCATIONS,
  HUB_SUFFIX,
  resolveCapeTownHubRowFromAreaInput,
  type CapeTownLocationRow,
  type CapeTownLocationSlug,
} from "@/lib/seo/capeTownLocations";
export { buildDynamicLocationFaqs } from "@/lib/seo/location-dynamic-faqs";

export type { CapeTownLocationRow, CapeTownLocationSlug } from "@/lib/seo/capeTownLocations";
export { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

/** Slim shape used by `RelatedLinks`, `capeTownSeoPages`, and legacy helpers. */
export type ProgrammaticLocation = {
  slug: CapeTownLocationSlug;
  name: string;
  city: string;
};

export const PROGRAMMATIC_LOCATIONS: readonly ProgrammaticLocation[] = CAPE_TOWN_LOCATIONS.map(
  ({ slug, name, city }) => ({ slug, name, city }),
);

/** Priority hubs for footer, blog index chips, and conversion-focused internal links. */
export const FOOTER_POPULAR_LOCATION_HUBS: readonly { readonly name: string; readonly slug: string }[] = [
  { name: "Claremont", slug: "claremont-cleaning-services" },
  { name: "Rondebosch", slug: "rondebosch-cleaning-services" },
  { name: "Gardens", slug: "gardens-cleaning-services" },
  { name: "Sea Point", slug: "sea-point-cleaning-services" },
  { name: "Green Point", slug: "green-point-cleaning-services" },
  { name: "Wynberg", slug: "wynberg-cleaning-services" },
  { name: "Durbanville", slug: "durbanville-cleaning-services" },
];

export type ProgrammaticLocationSlug = CapeTownLocationSlug;

const SLUG_ORDER = PROGRAMMATIC_LOCATIONS.map((l) => l.slug);
const SLUG_SET = new Set<string>(SLUG_ORDER);

function toHubSlug(key: string): string {
  const t = key.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (t.endsWith(HUB_SUFFIX)) return t;
  return `${t}${HUB_SUFFIX}`;
}

export function getCapeTownLocationRow(slug: string): CapeTownLocationRow | undefined {
  return resolveCapeTownHubRowFromAreaInput(slug);
}

export function getAllProgrammaticLocationSlugs(): ProgrammaticLocationSlug[] {
  return [...SLUG_ORDER] as ProgrammaticLocationSlug[];
}

export function getProgrammaticLocation(slug: string): ProgrammaticLocation | undefined {
  return PROGRAMMATIC_LOCATIONS.find((l) => l.slug === slug);
}

/**
 * Neighbouring hubs for internal linking: prefers `nearby` from `CAPE_TOWN_LOCATIONS`, then pads by catalogue order.
 * Unknown `nearby` keys (no matching hub yet) are skipped.
 */
export function nearbyProgrammaticLocations(slug: string, count = 4): ProgrammaticLocation[] {
  const row = resolveCapeTownHubRowFromAreaInput(slug);
  const out: ProgrammaticLocation[] = [];
  const seen = new Set<string>([slug]);

  if (row) {
    for (const key of row.nearby) {
      if (out.length >= count) break;
      const hub = toHubSlug(key);
      if (!SLUG_SET.has(hub) || hub === slug || seen.has(hub)) continue;
      const loc = getProgrammaticLocation(hub);
      if (loc) {
        out.push(loc);
        seen.add(hub);
      }
    }
  }

  const idx = SLUG_ORDER.indexOf(slug as ProgrammaticLocationSlug);
  if (idx === -1) return out;

  for (let step = 1; out.length < count && step < PROGRAMMATIC_LOCATIONS.length; step++) {
    const next = PROGRAMMATIC_LOCATIONS[(idx + step) % PROGRAMMATIC_LOCATIONS.length];
    if (seen.has(next.slug)) continue;
    out.push(next);
    seen.add(next.slug);
  }

  return out;
}

