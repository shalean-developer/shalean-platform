/** ZAR display from minor units (cents). */
export function formatZarFromCents(cents: number | null | undefined): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n / 100);
}
