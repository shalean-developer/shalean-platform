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
  "/quote",
  "/maid-services-cape-town",
  "/cleaning-prices-cape-town",
  "/privacy-policy",
  "/terms-of-service",
]);

export function usesMarketingHomeHeader(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return MARKETING_HOME_HEADER_PATHS.has(path);
}

/** When true, root layout should not render `GlobalTopNav` (page supplies its own header or none). */
export function shouldHideGlobalTopNav(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (usesMarketingHomeHeader(path)) return true;

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
