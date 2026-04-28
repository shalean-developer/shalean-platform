/** Coerce bigint/string/number DB or JSON values to non-negative integer cents, or null. */
export function optionalCentsFromDb(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** Whole or fractional ZAR from DB/JSON (used with `total_paid_zar` → cents in estimates). */
export function optionalZarAmountFromDb(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
