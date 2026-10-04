/**
 * Phase 1 legacy URL resolution for `proxy.ts` (Edge).
 * Single-hop redirects or 410 — destinations must be live indexable URLs (no chains into 410).
 */

import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";
import {
  isStage19IntentSegment,
  STAGE19_INTENT_SEGMENTS,
  type Stage19IntentSegment,
} from "@/lib/seo/seoPageRegistry";

export type LegacyPhase1Resolution = { type: "redirect"; pathname: string } | { type: "gone" };

const LEGACY_REGULAR_CLEANING_INTENT_ALIASES = [
  "cleaning-services",
  "affordable-cleaning",
  "weekly-cleaning",
] as const;

type LegacyRegularCleaningIntentAlias =
  (typeof LEGACY_REGULAR_CLEANING_INTENT_ALIASES)[number];

type LegacyGrowthIntent = Stage19IntentSegment | LegacyRegularCleaningIntentAlias;

export function normalizeLegacyCitySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

const SERVICE_PATH_BY_INTENT: Record<Stage19IntentSegment, string> = {
  "deep-cleaning": "/services/deep-cleaning-cape-town",
  "move-out-cleaning": "/services/move-out-cleaning-cape-town",
  "airbnb-cleaning": "/services/airbnb-cleaning-cape-town",
  "same-day-cleaning": "/services/standard-cleaning-cape-town",
  "office-cleaning": "/services/office-cleaning-cape-town",
};

const INTENTS_LONGEST_FIRST = [
  ...STAGE19_INTENT_SEGMENTS,
  ...LEGACY_REGULAR_CLEANING_INTENT_ALIASES,
].sort((a, b) => b.length - a.length) as LegacyGrowthIntent[];

function normalizeLegacyGrowthIntent(intentRaw: string): Stage19IntentSegment | null {
  const intent = intentRaw.trim().toLowerCase();
  if (isStage19IntentSegment(intent)) return intent;
  if (
    LEGACY_REGULAR_CLEANING_INTENT_ALIASES.includes(
      intent as LegacyRegularCleaningIntentAlias,
    )
  ) {
    return "same-day-cleaning";
  }
  return null;
}

/** Cape Town hub exists in `location-hubs.json` iff this returns a non-null path. */
export function resolveLegacySingularLocation(cityRaw: string, suburbRaw: string): LegacyPhase1Resolution {
  const city = normalizeLegacyCitySlug(cityRaw);
  const suburb = suburbRaw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!suburb) return { type: "gone" };

  if (city === "cape-town" || city === "capetown") {
    const hubPath = locationSeoPathFromLegacyAreaSlug(suburb);
    if (hubPath) return { type: "redirect", pathname: hubPath };
    return { type: "gone" };
  }

  /** Johannesburg / other metros: area routes retired — no relevant live replacement. */
  return { type: "gone" };
}

function parseGrowthLocalCombinedSegment(rest: string): { intent: LegacyGrowthIntent; suburb: string } | null {
  const r = rest.trim().toLowerCase();
  if (!r) return null;
  for (const intent of INTENTS_LONGEST_FIRST) {
    const prefix = `${intent}-`;
    if (r.startsWith(prefix)) {
      const suburb = r.slice(prefix.length);
      if (suburb) return { intent, suburb };
    }
  }
  return null;
}

/**
 * Intent × suburb → location hub when catalogue match exists, else Cape Town service page.
 * Never targets retired Stage-19 `/{intent}/{suburb}` paths (those 410'd / chain).
 */
function resolveGrowthIntentAndSuburb(intentRaw: string, suburbRaw: string): LegacyPhase1Resolution {
  const intent = normalizeLegacyGrowthIntent(intentRaw);
  const suburb = suburbRaw.trim().toLowerCase();
  if (!intent || !suburb) return { type: "gone" };

  const hubPath = locationSeoPathFromLegacyAreaSlug(suburb);
  if (hubPath) return { type: "redirect", pathname: hubPath };

  return { type: "redirect", pathname: SERVICE_PATH_BY_INTENT[intent] };
}

/**
 * `/growth/local/*` — location hub or service page (one hop), else 410.
 * Supports `/growth/local/{intent}/{suburb}` or `/growth/local/{intent}-{suburb}` (single tail).
 * Historical aliases `cleaning-services`, `affordable-cleaning`, and `weekly-cleaning`
 * converge onto the Regular Cleaning intent instead of remaining crawl-debt 404s.
 */
export function resolveLegacyGrowthLocal(pathname: string): LegacyPhase1Resolution | null {
  const norm = pathname.replace(/\/+$/, "") || "/";
  if (norm !== "/growth/local" && !norm.startsWith("/growth/local/")) return null;
  if (norm === "/growth/local") return { type: "gone" };

  const parts = norm.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "growth" || parts[1] !== "local") return null;

  if (parts.length === 3) {
    const combined = parts[2] ?? "";
    const parsed = parseGrowthLocalCombinedSegment(combined);
    if (!parsed) return { type: "gone" };
    return resolveGrowthIntentAndSuburb(parsed.intent, parsed.suburb);
  }

  if (parts.length === 4) {
    return resolveGrowthIntentAndSuburb(parts[2] ?? "", parts[3] ?? "");
  }

  return { type: "gone" };
}

/**
 * Retired Stage-19 `/{intent}/{suburb}` landings → hub or service (one hop).
 * Returns null when the path is not a Stage-19 intent URL.
 */
export function resolveLegacyStage19IntentPath(pathname: string): LegacyPhase1Resolution | null {
  const norm = pathname.replace(/\/+$/, "") || "/";
  const parts = norm.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const intent = parts[0] ?? "";
  const suburb = parts[1] ?? "";
  if (!normalizeLegacyGrowthIntent(intent)) return null;

  // Preserve the long-standing metro alias: this is a service-intent URL, not a suburb hub.
  if (
    intent === "cleaning-services" &&
    (normalizeLegacyCitySlug(suburb) === "cape-town" ||
      normalizeLegacyCitySlug(suburb) === "capetown")
  ) {
    return {
      type: "redirect",
      pathname: "/services/standard-cleaning-cape-town",
    };
  }

  return resolveGrowthIntentAndSuburb(intent, suburb);
}
