/**
 * Maps legacy `/admin/*` URLs to canonical `/office/*` paths.
 * Used by the edge proxy and login redirect helpers.
 */
export function remapAdminPathToOffice(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/admin") return "/office";

  if (normalized === "/admin/login") return "/login";

  if (normalized === "/admin/ops/sla-breaches" || normalized.startsWith("/admin/ops/sla-breaches/")) {
    return normalized.replace("/admin/ops/sla-breaches", "/office/sla-breaches");
  }

  if (normalized === "/admin/ops/cleaner-performance" || normalized.startsWith("/admin/ops/cleaner-performance/")) {
    return normalized.replace("/admin/ops/cleaner-performance", "/office/cleaner-performance");
  }

  if (normalized === "/admin/reviews/analytics" || normalized.startsWith("/admin/reviews/analytics/")) {
    return normalized.replace("/admin/reviews/analytics", "/office/review-funnel");
  }

  if (normalized === "/admin/cleaners/manage" || normalized.startsWith("/admin/cleaners/manage/")) {
    return "/office/cleaners";
  }

  if (normalized === "/admin/payout-runs" || normalized.startsWith("/admin/payout-runs/")) {
    return "/office/payouts";
  }

  if (normalized.startsWith("/admin/")) {
    return `/office${normalized.slice("/admin".length)}`;
  }

  return normalized;
}
