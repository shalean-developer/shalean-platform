import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { DB_SLUG_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";
import { SERVICE_PRICING_CONTRACTS } from "@/lib/booking-v2/servicePricingContract";

/**
 * Canonical engine / pricing_services slugs plus marketing / admin variants.
 *
 * Staging historically seeded SEO-style slugs while booking-v2 + legacy engines
 * look up short engine ids — without aliases, room rates resolve to 0 and the
 * quote appears "not calculating".
 *
 * Move-in / move-out prefer their own rows when present; otherwise fall back to
 * shared `move`, then standard.
 */
export const PRICING_SERVICE_SLUG_ALIASES: Readonly<Record<string, readonly string[]>> = {
  standard: ["standard", "standard-cleaning", "regular", "regular-cleaning"],
  deep: ["deep", "deep-cleaning"],
  move: ["move", "moving", "moving-cleaning"],
  "move-in": ["move-in", "move_in", "moving-in-cleaning", "moving_in"],
  "move-out": ["move-out", "move_out", "moving-out-cleaning", "moving_out"],
  airbnb: ["airbnb", "airbnb-cleaning"],
  carpet: ["carpet", "carpet-cleaning"],
  office: ["office", "office-cleaning", "quick"],
};

/** All candidate DB slugs for a canonical engine (or already-canonical) pricing slug. */
export function pricingServiceSlugCandidates(pricingSlug: string): string[] {
  const key = pricingSlug.trim().toLowerCase();
  if (!key) return [];
  const fromAlias = PRICING_SERVICE_SLUG_ALIASES[key];
  if (fromAlias) return [...fromAlias];
  for (const [canonical, aliases] of Object.entries(PRICING_SERVICE_SLUG_ALIASES)) {
    if (aliases.includes(key)) {
      return [canonical, ...aliases.filter((a) => a !== canonical)];
    }
  }
  return [key];
}

/** Resolve a pricing_services row by canonical slug or known alias. */
export function resolvePricingServiceRow<T>(
  dbServices: Record<string, T>,
  pricingSlug: string,
): T | null {
  for (const candidate of pricingServiceSlugCandidates(pricingSlug)) {
    const row = dbServices[candidate];
    if (row != null) return row;
  }
  return null;
}

/**
 * Resolve move pricing row: prefer move-in / move-out when moveType is set and
 * that row exists; else shared `move`; else null (caller may fall back to standard).
 */
export function resolveMovingPricingSlug(
  moveType: string | number | boolean | null | undefined,
): "move-in" | "move-out" | "move" {
  const t = String(moveType ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (t === "move_in" || t === "movein" || t === "in") return "move-in";
  if (t === "move_out" || t === "moveout" || t === "out") return "move-out";
  return "move";
}

export function resolveMovingPricingServiceRow<T>(
  dbServices: Record<string, T>,
  moveType: string | number | boolean | null | undefined,
): T | null {
  const preferred = resolveMovingPricingSlug(moveType);
  return (
    resolvePricingServiceRow(dbServices, preferred) ??
    resolvePricingServiceRow(dbServices, "move")
  );
}

/** Engine pricing slug for a booking-v2 service (before DB alias resolution). */
export function enginePricingSlugForBookingV2(serviceSlug: ServiceSlug): string {
  return DB_SLUG_MAP[serviceSlug] ?? SERVICE_PRICING_CONTRACTS[serviceSlug].canonicalPricingKey;
}

/** Normalize any known alias to its canonical pricing key. */
export function canonicalizePricingServiceSlug(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return key;
  if (PRICING_SERVICE_SLUG_ALIASES[key]) return key;
  for (const [canonical, aliases] of Object.entries(PRICING_SERVICE_SLUG_ALIASES)) {
    if (aliases.includes(key)) return canonical;
  }
  return key;
}
