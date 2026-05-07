/** Consistent ZAR display for cleaner surfaces (workspace, earnings, profile). */

export function formatZarFromCents(cents: number): string {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  return `R${(n / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Job earnings: do **not** coerce null/undefined to zero (unknown ≠ R0).
 * - `null` / `undefined` / non-finite → `"—"`
 * - finite ≥ 0 → `R…` or `Est. R…` when `estimate` is true
 */
export function formatCleanerJobEarningsLabel(
  cents: number | null | undefined,
  opts?: { estimate?: boolean },
): string {
  if (cents == null) return "—";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.max(0, Math.round(n));
  const body = `R${(rounded / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return opts?.estimate === true ? `Est. ${body}` : body;
}

export function formatZarWhole(zar: number): string {
  const n = Math.max(0, Math.round(Number(zar) || 0));
  return `R${n.toLocaleString("en-ZA")}`;
}
