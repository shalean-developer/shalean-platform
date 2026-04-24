/** Persisted ops queue filter for /admin/bookings deep links (per browser). */
export const LAST_OPS_FILTER_STORAGE_KEY = "lastOpsFilter";

const VALID = new Set(["unassignable", "sla", "unassigned", "starting-soon"]);

export function isStoredOpsFilter(value: string | null | undefined): value is string {
  return typeof value === "string" && VALID.has(value);
}

export function persistLastOpsFilter(urlFilterValue: string | null): void {
  if (typeof window === "undefined") return;
  if (isStoredOpsFilter(urlFilterValue)) {
    localStorage.setItem(LAST_OPS_FILTER_STORAGE_KEY, urlFilterValue);
    return;
  }
  localStorage.removeItem(LAST_OPS_FILTER_STORAGE_KEY);
}

export function readLastOpsFilter(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LAST_OPS_FILTER_STORAGE_KEY);
  return isStoredOpsFilter(v) ? v : null;
}
