export const GENERATED_PREFERRED_ROSTER_SOURCES = new Set([
  "checkout_preferred",
  "customer_preferred",
  "recurring_preferred",
  "recurring_continuity",
  "booking_v2_r0",
]);

export function isGeneratedPreferredRosterSource(source: unknown): boolean {
  return GENERATED_PREFERRED_ROSTER_SOURCES.has(String(source ?? "").trim().toLowerCase());
}

export function rosterHasCustomProvenance(
  rows: readonly { source?: string | null }[] | null | undefined,
): boolean {
  const roster = Array.isArray(rows) ? rows : [];
  return roster.length > 0 && roster.some((row) => !isGeneratedPreferredRosterSource(row.source));
}
