import type { AppUserRole } from "@/lib/auth/userRole";
import { dashboardRouteForRole } from "@/lib/auth/userRole";

/**
 * Public marketing pages should send authenticated users to their role dashboard.
 * Passing /account through the existing post-auth resolver preserves customer intent
 * while cleaner and admin accounts fall back to their canonical dashboards.
 */
export function publicHeaderPostAuthRedirect(pathname: string, query = ""): string {
  const path = pathname.trim();
  if (!path || path === "/") return "/account";
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const safeQuery = query.trim().replace(/^\?/, "");
  return `${safePath}${safeQuery ? `?${safeQuery}` : ""}`;
}

export function publicHeaderDashboardHref(role: AppUserRole | null): string {
  return role ? dashboardRouteForRole(role) : "/account";
}

export function publicHeaderAccountLabel(role: AppUserRole | null): string {
  if (role === "admin") return "Office Dashboard";
  if (role === "cleaner") return "Cleaner Workspace";
  return "My Account";
}

export function publicHeaderShowsCustomerBookings(role: AppUserRole | null): boolean {
  return role === null || role === "customer";
}
