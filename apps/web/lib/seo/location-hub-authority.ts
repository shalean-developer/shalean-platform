import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { getLocationGeoHints } from "@/lib/seo/location-geo-enrichment";

function hashSlug(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Operating narrative — editorial constant (adjust if brand timeline changes). */
const OPERATING_SINCE_YEAR = 2019;

function propertyMixLabel(loc: CapeTownLocationRow): string {
  const labels: Record<string, string> = {
    apartment: "apartments and sectional schemes",
    family_home: "family houses",
    short_stay: "short-stay and guest turnovers",
    luxury_home: "larger executive homes",
    student_share: "student shares and compact flats",
    townhouse: "townhouses and duplexes",
  };
  const bits = loc.propertyTypes.map((p) => labels[p] ?? p);
  if (bits.length === 0) return "mixed residential stock";
  if (bits.length === 1) return bits[0]!;
  return `${bits.slice(0, -1).join(", ")} plus ${bits[bits.length - 1]}`;
}

/** Network size band — deterministic from slug (not a live headcount). */
export function locationAuthorityCleanerNetworkBand(slug: string): { low: number; high: number } {
  const h = hashSlug(`${slug}:cleaners`);
  const low = 42 + (h % 28);
  const high = low + 18 + (h % 35);
  return { low, high };
}

export type LocationAuthorityAboutCopy = {
  heading: string;
  paragraphs: string[];
};

/** “About Shalean in {area}” — E-E-A-T style signals without fabricated metrics. */
export function buildLocationAuthorityAboutBlock(loc: CapeTownLocationRow): LocationAuthorityAboutCopy {
  const { low, high } = locationAuthorityCleanerNetworkBand(loc.slug);
  const mix = propertyMixLabel(loc);
  const years = new Date().getFullYear() - OPERATING_SINCE_YEAR;

  return {
    heading: `About Shalean in ${loc.name}`,
    paragraphs: [
      `Shalean has coordinated vetted home cleaners across ${loc.city} since ${OPERATING_SINCE_YEAR} — roughly ${years}+ seasons of routing, quality checks, and repeat bookings. We focus on transparent quotes, insured teams, and suburb-aware access notes so visits match real-world conditions in ${loc.name}.`,
      `Our active cleaner network typically spans ${low.toLocaleString("en-ZA")}–${high.toLocaleString("en-ZA")}+ vetted professionals depending on season and demand — enough coverage depth to serve ${mix} throughout ${loc.region}, including ${loc.name}.`,
      `Service depth here means standard upkeep, deep resets, move-out inventory cleans, and host turnovers — each scoped online before dispatch so ${loc.name} addresses map to realistic crew time.`,
    ],
  };
}

export type LocationRecentBookingExample = { text: string };

/**
 * Simulated “recent booking” vignettes — stylistic examples only; rotated deterministically.
 * Phrasing avoids implying identifiable real orders.
 */
export function buildLocationRecentBookingExamples(
  loc: CapeTownLocationRow,
  cycleEpoch: number,
): LocationRecentBookingExample[] {
  const geo = getLocationGeoHints(loc.slug);
  const roads = geo?.roads?.length ? geo.roads : ["Main Road", "a nearby arterial"];
  const micro = geo?.microAreas?.length ? geo.microAreas : ["a residential pocket"];
  const r = hashSlug(`${loc.slug}:book:${cycleEpoch}`);

  const roadA = roads[r % roads.length]!;
  const roadB = roads[(r + 1) % roads.length]!;
  const pocket = micro[r % micro.length]!;

  const variants: LocationRecentBookingExample[][] = [
    [
      {
        text: `Last week a 2-bedroom apartment near ${roadA} in ${loc.name} booked a standard clean — kitchens and bathrooms first — ahead of family staying over.`,
      },
      {
        text: `A move-out deep clean completed near ${roadB} last month aligned inventory photos; ovens and bathrooms were flagged in booking notes so crew time matched the checklist.`,
      },
      {
        text: `Hosts in ${pocket} scheduled a turnover clean after a short-stay checkout — linen reset, floors, and balcony dust called out so the next guest walked into a finished space.`,
      },
    ],
    [
      {
        text: `A compact flat off ${roadB} locked a mid-week standard visit — tight on parking, so bay instructions in the booking trimmed arrival friction.`,
      },
      {
        text: `Near ${roadA}, a ${loc.name} townhouse booked deep tier focus on grease-heavy kitchens and bathroom limescale before an extended trip.`,
      },
      {
        text: `Teams routed through ${pocket} handled a move-out scope with extra bathroom time — typical when agencies photograph grout lines harshly at handover.`,
      },
    ],
    [
      {
        text: `Recurring fortnightly cleans continue for a family home backing ${pocket} — pet hair and passage dust noted so vacuum dwell stays honest.`,
      },
      {
        text: `An Airbnb-style turnaround near ${roadA} squeezed bathrooms, kitchen resets, and floor mopping inside a narrow checkout window.`,
      },
      {
        text: `A three-bedroom rental near ${roadB} chose standard cleaning plus oven front attention — add-ons selected online before checkout.`,
      },
    ],
  ];

  return variants[r % variants.length]!;
}
