/** Persisted severity tier on /admin/ops/sla-breaches (per browser). */
export const LAST_SLA_TIER_FILTER_STORAGE_KEY = "lastSlaTierFilter";

const VALID = new Set(["all", "gt30", "gt10"]);

export type SlaTierFilterKey = "all" | "gt30" | "gt10";

export function isStoredSlaTierFilter(value: string | null | undefined): value is SlaTierFilterKey {
  return typeof value === "string" && VALID.has(value);
}

export function persistLastSlaTierFilter(value: SlaTierFilterKey): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SLA_TIER_FILTER_STORAGE_KEY, value);
}

export function readLastSlaTierFilter(): SlaTierFilterKey | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LAST_SLA_TIER_FILTER_STORAGE_KEY);
  return isStoredSlaTierFilter(v) ? v : null;
}
