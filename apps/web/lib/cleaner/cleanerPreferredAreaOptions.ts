import { BOOKING_FLOW_LOCATION_HINTS } from "@/lib/booking/bookingFlowLocationCatalog";

/** Extra suburbs commonly requested by cleaners; merged with booking catalog names (deduped). */
const EXTRA_PREFERRED_AREAS = ["Belgravia", "Kenilworth"] as const;

/**
 * Sorted display names for cleaner “preferred work area” requests (searchable multi-select).
 */
export const CLEANER_PREFERRED_AREA_NAMES: readonly string[] = (() => {
  const byLower = new Map<string, string>();
  for (const h of BOOKING_FLOW_LOCATION_HINTS) {
    byLower.set(h.name.toLowerCase(), h.name);
  }
  for (const x of EXTRA_PREFERRED_AREAS) {
    if (!byLower.has(x.toLowerCase())) byLower.set(x.toLowerCase(), x);
  }
  return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
})();

const CANONICAL_BY_LOWER = new Map(CLEANER_PREFERRED_AREA_NAMES.map((n) => [n.toLowerCase(), n]));

export function canonicalPreferredAreaName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return CANONICAL_BY_LOWER.get(t.toLowerCase()) ?? null;
}
