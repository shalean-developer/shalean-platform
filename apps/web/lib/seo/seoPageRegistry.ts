import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { buildSeoBookingHref, recommendedSeoExtras, type SeoBookingPrefill } from "@/lib/booking/seoBookingPrefill";
import { locationHubPathFromAreaInput, resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";

/**
 * Stage 19 canonical URLs: `/{intentSegment}/{bookingAreaSlug}` (see `docs/master_seo_matrix.csv`).
 * One intent × one area → exactly one row (SEO operating system).
 */
export const STAGE19_INTENT_SEGMENTS = [
  "deep-cleaning",
  "move-out-cleaning",
  "airbnb-cleaning",
  "same-day-cleaning",
  "office-cleaning",
] as const;

export type Stage19IntentSegment = (typeof STAGE19_INTENT_SEGMENTS)[number];

export type SeoSchemaBlockId = "LocalBusiness" | "Service" | "FAQPage" | "BreadcrumbList";

export type SeoStage19Priority = "P0" | "P1" | "P2";

export type SeoStage19RegistryRow = {
  intentSegment: Stage19IntentSegment;
  /** Second URL segment — matches `BOOKING_FLOW_LOCATION_HINTS.slug` (e.g. sea-point). */
  suburbSlug: string;
  suburbDisplayName: string;
  canonicalPath: string;
  bookingServiceId: BookingServiceId;
  bookingLocationSlug: string;
  pageType: "service-location";
  schemaTypes: readonly SeoSchemaBlockId[];
  ctaSource: string;
  priority: SeoStage19Priority;
  /** Cluster id for internal linking (nearby intents + geography). */
  internalLinkGroup: string;
  searchIntent: "commercial" | "informational";
};

const INTENT_LABEL: Record<Stage19IntentSegment, string> = {
  "deep-cleaning": "Deep cleaning",
  "move-out-cleaning": "Move-out cleaning",
  "airbnb-cleaning": "Airbnb & short-stay cleaning",
  "same-day-cleaning": "Same-day cleaning",
  "office-cleaning": "Office cleaning",
};

type SuburbRow = { slug: string; display: string; internalLinkGroup: string };

/** Priority launch suburbs — aligned with `docs/master_seo_matrix.csv`. */
const STAGE19_PRIORITY_SUBURBS: readonly SuburbRow[] = [
  { slug: "sea-point", display: "Sea Point", internalLinkGroup: "atlantic-seaboard" },
  { slug: "green-point", display: "Green Point", internalLinkGroup: "atlantic-seaboard" },
  { slug: "claremont", display: "Claremont", internalLinkGroup: "southern-suburbs" },
  { slug: "century-city", display: "Century City", internalLinkGroup: "northern-corridor" },
  { slug: "camps-bay", display: "Camps Bay", internalLinkGroup: "atlantic-seaboard" },
] as const;

type IntentDef = {
  segment: Stage19IntentSegment;
  bookingServiceId: BookingServiceId;
  defaultPriority: SeoStage19Priority;
  /** Explicit alternate legacy URLs — additive to {@link airbnbLegacyServicePage}. */
  legacyAlternatePaths?: readonly string[];
};

/**
 * Rich editorial Airbnb landings live at `/services/airbnb-cleaning-{area}` (`AirbnbAreaServiceLanding`).
 * Skip Stage 19 duplicate URLs for these until content is migrated to `/airbnb-cleaning/{area}`.
 */
const AIRBNB_EDITORIAL_SUBURB_SLUGS = new Set<string>(["sea-point", "green-point", "claremont"]);

const INTENT_DEFS: readonly IntentDef[] = [
  { segment: "deep-cleaning", bookingServiceId: "deep", defaultPriority: "P0" },
  { segment: "move-out-cleaning", bookingServiceId: "move", defaultPriority: "P0" },
  {
    segment: "airbnb-cleaning",
    bookingServiceId: "airbnb",
    defaultPriority: "P0",
  },
  {
    segment: "same-day-cleaning",
    bookingServiceId: "standard",
    defaultPriority: "P0",
  },
  {
    segment: "office-cleaning",
    bookingServiceId: "standard",
    defaultPriority: "P1",
  },
];

function ctaSourceFor(segment: Stage19IntentSegment, suburbSlug: string): string {
  const seg = segment.replace(/-/g, "_");
  const sub = suburbSlug.replace(/-/g, "_");
  return `seo_${seg}_${sub}`;
}

function buildCrossProductRows(): SeoStage19RegistryRow[] {
  const out: SeoStage19RegistryRow[] = [];
  for (const intent of INTENT_DEFS) {
    for (const sub of STAGE19_PRIORITY_SUBURBS) {
      const canonicalPath = `/${intent.segment}/${sub.slug}`;
      if (intent.segment === "airbnb-cleaning" && AIRBNB_EDITORIAL_SUBURB_SLUGS.has(sub.slug)) {
        continue;
      }
      out.push({
        intentSegment: intent.segment,
        suburbSlug: sub.slug,
        suburbDisplayName: sub.display,
        canonicalPath,
        bookingServiceId: intent.bookingServiceId,
        bookingLocationSlug: sub.slug,
        pageType: "service-location",
        schemaTypes: ["LocalBusiness", "Service", "BreadcrumbList"],
        ctaSource: ctaSourceFor(intent.segment, sub.slug),
        priority: intent.defaultPriority,
        internalLinkGroup: `${sub.internalLinkGroup}-${intent.segment}`,
        searchIntent: "commercial",
      });
    }
  }
  return out;
}

/** Metro row: same-day × Cape Town wide (booking slug `cape-town` exists in funnel hints). */
const SAME_DAY_METRO_ROW: SeoStage19RegistryRow = {
  intentSegment: "same-day-cleaning",
  suburbSlug: "cape-town",
  suburbDisplayName: "Cape Town",
  canonicalPath: "/same-day-cleaning/cape-town",
  bookingServiceId: "standard",
  bookingLocationSlug: "cape-town",
  pageType: "service-location",
  schemaTypes: ["LocalBusiness", "Service", "BreadcrumbList"],
  ctaSource: "seo_same_day_cleaning_cape_town_metro",
  priority: "P0",
  internalLinkGroup: "metro-same-day",
  searchIntent: "commercial",
};

/** Source of truth for Stage 19 programmatic landings — drives static params + canonicals. */
export const SEO_STAGE19_REGISTRY: readonly SeoStage19RegistryRow[] = [...buildCrossProductRows(), SAME_DAY_METRO_ROW];

const registryKey = (intent: string, suburb: string) => `${intent}|${suburb}`;
const REGISTRY_BY_KEY = new Map<string, SeoStage19RegistryRow>(
  SEO_STAGE19_REGISTRY.map((r) => [registryKey(r.intentSegment, r.suburbSlug), r]),
);

export function isStage19IntentSegment(value: string): value is Stage19IntentSegment {
  return (STAGE19_INTENT_SEGMENTS as readonly string[]).includes(value);
}

export function findStage19RegistryRow(
  intentSegment: string,
  suburbSlug: string,
): SeoStage19RegistryRow | undefined {
  return REGISTRY_BY_KEY.get(registryKey(intentSegment, suburbSlug.trim().toLowerCase()));
}

export function stage19IntentLabel(segment: Stage19IntentSegment): string {
  return INTENT_LABEL[segment];
}

/** Primary booking entry with service, location, recommended extras, and CTA attribution. */
export function buildStage19BookingHref(row: SeoStage19RegistryRow): string {
  const prefill: SeoBookingPrefill = {
    service: row.bookingServiceId,
    locationSlug: row.bookingLocationSlug,
    extras: recommendedSeoExtras(row.bookingServiceId),
    source: row.ctaSource,
  };
  return buildSeoBookingHref("details", prefill);
}

/** Related URLs for topical clusters (STEP 8). Caps surface area per page. */
export function stage19RelatedLinks(row: SeoStage19RegistryRow, maxEach = 4): {
  sameSuburb: SeoStage19RegistryRow[];
  sameIntent: SeoStage19RegistryRow[];
} {
  const sameSuburb = SEO_STAGE19_REGISTRY.filter(
    (r) => r.suburbSlug === row.suburbSlug && r.intentSegment !== row.intentSegment,
  ).slice(0, maxEach);
  const sameIntent = SEO_STAGE19_REGISTRY.filter(
    (r) => r.intentSegment === row.intentSegment && r.suburbSlug !== row.suburbSlug,
  ).slice(0, maxEach);
  return { sameSuburb, sameIntent };
}

/** Canonical `/locations/{hub}` href when hub exists — never invent slugs. */
export function stage19LocationHubHref(suburbSlug: string): string | null {
  const hubPath = locationHubPathFromAreaInput(suburbSlug);
  return hubPath ?? null;
}

export function stage19HubRowForSuburb(suburbSlug: string) {
  return resolveCapeTownHubRowFromAreaInput(suburbSlug);
}
