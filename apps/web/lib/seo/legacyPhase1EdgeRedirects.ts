/**
 * Phase 1 legacy URL resolution for `proxy.ts` (Edge).
 * Single-hop redirects or 410 — no homepage, no `/locations` catalogue dumping.
 */

import { locationNameForCity } from "@/lib/growth/locations";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";
import {
  findStage19RegistryRow,
  isStage19IntentSegment,
  STAGE19_INTENT_SEGMENTS,
  type Stage19IntentSegment,
} from "@/lib/seo/seoPageRegistry";

export type LegacyPhase1Resolution = { type: "redirect"; pathname: string } | { type: "gone" };

export function normalizeLegacyCitySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
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

  if (city === "johannesburg") {
    if (locationNameForCity("johannesburg", suburb)) {
      return { type: "redirect", pathname: `/johannesburg/cleaning-services/${suburb}` };
    }
    return { type: "gone" };
  }

  /** Pretoria / Durban / eThekwini: no `/{city}/cleaning-services/{suburb}` routes in app today. */
  if (city === "pretoria" || city === "tshwane" || city === "durban" || city === "ekurhuleni" || city === "pietermaritzburg") {
    return { type: "gone" };
  }

  return { type: "gone" };
}

const SERVICE_PATH_BY_INTENT: Record<Stage19IntentSegment, string> = {
  "deep-cleaning": "/services/deep-cleaning-cape-town",
  "move-out-cleaning": "/services/move-out-cleaning-cape-town",
  "airbnb-cleaning": "/services/airbnb-cleaning-cape-town",
  "same-day-cleaning": "/services/standard-cleaning-cape-town",
  "office-cleaning": "/services/office-cleaning-cape-town",
};

const INTENTS_LONGEST_FIRST = [...STAGE19_INTENT_SEGMENTS].sort((a, b) => b.length - a.length);

function parseGrowthLocalCombinedSegment(rest: string): { intent: Stage19IntentSegment; suburb: string } | null {
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

function resolveGrowthIntentAndSuburb(intentRaw: string, suburbRaw: string): LegacyPhase1Resolution {
  const intent = intentRaw.trim().toLowerCase();
  const suburb = suburbRaw.trim().toLowerCase();
  if (!isStage19IntentSegment(intent) || !suburb) return { type: "gone" };

  const row = findStage19RegistryRow(intent, suburb);
  if (row) return { type: "redirect", pathname: row.canonicalPath };

  const svc = SERVICE_PATH_BY_INTENT[intent];
  return { type: "redirect", pathname: svc };
}

/**
 * `/growth/local/*` — Stage 19 match first, else Cape Town service hub for intent, else 410.
 * Supports `/growth/local/{intent}/{suburb}` or `/growth/local/{intent}-{suburb}` (single tail).
 */
export function resolveLegacyGrowthLocal(pathname: string): LegacyPhase1Resolution | null {
  const norm = pathname.replace(/\/+$/, "") || "/";
  if (norm !== "/growth/local" && !norm.startsWith("/growth/local/")) return null;
  if (norm === "/growth/local") return { type: "gone" };

  const parts = norm.split("/").filter(Boolean);
  // ["growth", "local", ...]
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
