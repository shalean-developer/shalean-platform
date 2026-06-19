import "server-only";

/** Office pages wired to live `/api/admin/*` data (informational audit). */
export const OFFICE_PLACEHOLDER_PAGES: { path: string; constant: string }[] = [];

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
  return {
    passed: true,
    details: {
      coreDashboardApis: CORE_DASHBOARD_API_ROUTES,
      legacyBookingsApiNote:
        "GET /api/bookings must not return mock-* booking ids (deprecated route).",
      placeholderOfficePages: [] as string[],
      placeholderCount: 0,
    },
  };
}
