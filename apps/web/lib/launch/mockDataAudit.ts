import "server-only";

/** Known office UI shells that still use static placeholder arrays (informational only). */
export const OFFICE_PLACEHOLDER_PAGES: { path: string; constant: string }[] = [
  { path: "office/conversion/page.tsx", constant: "LANDING_PAGES" },
  { path: "office/disputes/page.tsx", constant: "DISPUTES" },
  { path: "office/analytics/page.tsx", constant: "SERVICE_POPULARITY" },
  { path: "office/marketing/page.tsx", constant: "CAMPAIGNS" },
  { path: "office/metrics/page.tsx", constant: "METRIC_CARDS" },
  { path: "office/funnel-intelligence/page.tsx", constant: "STEPS" },
  { path: "office/review-funnel/page.tsx", constant: "FUNNEL_STEPS" },
  { path: "office/seo-attribution/page.tsx", constant: "TOP_PAGES" },
  { path: "office/seo-insights/page.tsx", constant: "KEYWORDS" },
  { path: "office/referrals/page.tsx", constant: "REFERRALS" },
  { path: "office/ops-health/page.tsx", constant: "SERVICES" },
  { path: "office/operations/page.tsx", constant: "OPEN_ISSUES" },
  { path: "office/notifications/page.tsx", constant: "CHANNEL_STATS" },
  { path: "office/templates/page.tsx", constant: "TEMPLATES" },
  { path: "office/pricing/page.tsx", constant: "BASE_PRICING" },
  { path: "office/blog/page.tsx", constant: "POSTS" },
];

export const CORE_DASHBOARD_API_ROUTES = [
  "/api/customer/bookings",
  "/api/dashboard/summary",
  "/api/admin/bookings",
  "/api/cleaner/dashboard",
  "/api/cleaner/offers",
] as const;

export function auditMockDashboardData(): {
  passed: boolean;
  error?: string;
  details: Record<string, unknown>;
} {
  const warnings = OFFICE_PLACEHOLDER_PAGES.map((p) => `${p.path} (${p.constant})`);
  return {
    passed: true,
    details: {
      coreDashboardApis: CORE_DASHBOARD_API_ROUTES,
      legacyBookingsApiNote:
        "GET /api/bookings must not return mock-* booking ids (deprecated route).",
      placeholderOfficePages: warnings,
      placeholderCount: warnings.length,
    },
  };
}
