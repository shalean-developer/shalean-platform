/** Consistent ZAR display for cleaner surfaces (workspace, earnings, profile). */

export function formatZarFromCents(cents: number): string {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  return `R${(n / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatZarWhole(zar: number): string {
  const n = Math.max(0, Math.round(Number(zar) || 0));
  return `R${n.toLocaleString("en-ZA")}`;
}
