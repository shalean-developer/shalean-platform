/** Canonical `bookings.service_slug` values for income budget lines. */
export const INCOME_BUDGET_SERVICE_OPTIONS = [
  { slug: "standard", label: "Standard cleaning" },
  { slug: "airbnb", label: "Airbnb cleaning" },
  { slug: "deep", label: "Deep cleaning" },
  { slug: "move", label: "Move-in / move-out" },
  { slug: "carpet", label: "Carpet cleaning" },
  { slug: "office", label: "Office cleaning" },
] as const;

export const INCOME_BUDGET_SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  INCOME_BUDGET_SERVICE_OPTIONS.map((o) => [o.slug, o.label]),
);
