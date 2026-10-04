import { isAuthShellRoute } from "@/lib/auth/authShellRoutes";
import { isOfficePortalPath } from "@/lib/auth/officePortalPath";

/**
 * Routes that render their own marketing header (`MarketingHomeHeader`, `QuotePageHeader`, or `LegalPageShell`).
 * Root `GlobalTopNav` must be hidden on these paths to avoid duplicate headers.
 */
const MARKETING_HOME_HEADER_PATHS = new Set([
  "/",
  "/about",
  "/faq",
  "/reviews",
  "/contact",
  "/areas-we-serve",
  "/refer",
  "/quote",
  "/maid-services-cape-town",
  "/cleaning-prices-cape-town",
  "/privacy-policy",
  "/terms-of-service",
  "/data-deletion",
  "/data-deletion/status",
]);

/**
 * Public route families that still rely on root GlobalTopNav ownership but must
 * use the homepage visual header during RD public-page normalization.
 */
const HOMEPAGE_STYLED_GLOBAL_NAV_PREFIXES = ["/services", "/locations", "/blog"] as const;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function usesMarketingHomeHeader(pathname: string): boolean {
  return MARKETING_HOME_HEADER_PATHS.has(normalizePath(pathname));
}

export function usesHomepageStyledGlobalTopNav(pathname: string): boolean {
  const path = normalizePath(pathname);
  return HOMEPAGE_STYLED_GLOBAL_NAV_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** When true, root layout should not render `GlobalTopNav` (page supplies its own header or none). */
export function shouldHideGlobalTopNav(pathname: string): boolean {
  const path = normalizePath(pathname);

  if (usesMarketingHomeHeader(path)) return true;

  // Development catalogues need an isolated presentation surface. The root
  // non-production warning remains visible, but customer marketing chrome does not.
  if (path === "/dev" || path.startsWith("/dev/")) return true;

  if (isAuthShellRoute(path)) return true;

  if (path.startsWith("/admin")) return true;

  if (path === "/book" || path.startsWith("/book/")) return true;
  if (path === "/booking" || path.startsWith("/booking/")) return true;

  if (path === "/dashboard" || path.startsWith("/dashboard/")) return true;

  if (path.startsWith("/cleaner")) return true;

  if (path === "/account" || path.startsWith("/account/")) return true;

  if (path === "/jobs" || path.startsWith("/jobs/")) return true;

  if (isOfficePortalPath(path)) return true;

  return false;
}
