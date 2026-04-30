/**
 * Programmatic location helpers — catalogue lives in `capeTownLocations.ts`.
 *
 * `nearby`: short area keys — normalized to `{key}-cleaning-services` and only emitted when that hub exists.
 */
import {
  CAPE_TOWN_LOCATIONS,
  HUB_SUFFIX,
  type CapeTownLocationRow,
  type CapeTownLocationSlug,
} from "@/lib/seo/capeTownLocations";

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

export type ProgrammaticLocationSlug = CapeTownLocationSlug;

const SLUG_ORDER = PROGRAMMATIC_LOCATIONS.map((l) => l.slug);
const SLUG_SET = new Set<string>(SLUG_ORDER);

function toHubSlug(key: string): string {
  const t = key.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (t.endsWith(HUB_SUFFIX)) return t;
  return `${t}${HUB_SUFFIX}`;
}

function rowBySlug(slug: string): (typeof CAPE_TOWN_LOCATIONS)[number] | undefined {
  return CAPE_TOWN_LOCATIONS.find((l) => l.slug === slug);
}

export function getCapeTownLocationRow(slug: string): CapeTownLocationRow | undefined {
  return rowBySlug(slug);
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
  const row = rowBySlug(slug);
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

/** Default on-page FAQs when a hub has no custom `faqs` in `LOCATION_SEO_PAGES` (unique per suburb name). */
export function defaultLocationFaqs(name: string, city: string): { q: string; a: string }[] {
  return [
    {
      q: `Do you offer cleaning in ${name}?`,
      a: `Yes. Shalean dispatches vetted teams across ${name}, ${city}. Enter your street address at checkout so we can confirm coverage and show an accurate quote before you pay.`,
    },
    {
      q: `Which cleaning services can I book for ${name}?`,
      a: `You can book standard home cleaning, deep cleaning, move-out cleaning, Airbnb turnovers, office cleaning, and carpet or sofa care. Each service has a Cape Town-wide guide; your ${name} address finalises scope and pricing.`,
    },
    {
      q: "How do I book a cleaner online?",
      a: "Choose your service and home size on Shalean, add any extras, then pick a time slot. You will see a clear total before you confirm—no surprise surcharges for the items you selected.",
    },
  ];
}
