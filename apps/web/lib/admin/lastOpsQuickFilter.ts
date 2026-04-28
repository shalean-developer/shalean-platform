/** Persisted `opsQuick` query for /admin/bookings (per browser). */

export const LAST_OPS_QUICK_STORAGE_KEY = "lastOpsQuickFilter";

const VALID = new Set(["monthly_only", "awaiting_payment", "today", "tomorrow"]);

export function isStoredOpsQuick(value: string | null | undefined): value is string {
  return typeof value === "string" && VALID.has(value);
}

export function persistLastOpsQuick(urlOpsQuick: string | null): void {
  if (typeof window === "undefined") return;
  const v = (urlOpsQuick ?? "").trim().toLowerCase();
  if (isStoredOpsQuick(v)) {
    localStorage.setItem(LAST_OPS_QUICK_STORAGE_KEY, v);
    return;
  }
  localStorage.removeItem(LAST_OPS_QUICK_STORAGE_KEY);
}

export function readLastOpsQuick(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LAST_OPS_QUICK_STORAGE_KEY)?.trim().toLowerCase() ?? "";
  return isStoredOpsQuick(v) ? v : null;
}
