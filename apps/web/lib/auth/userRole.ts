/** Primary app roles — sourced from `user_profiles.role` (product: profiles.role). */
export type AppUserRole = "admin" | "cleaner" | "customer";

export const APP_USER_ROLES: readonly AppUserRole[] = ["admin", "cleaner", "customer"] as const;

export const ROLE_DASHBOARD_ROUTES: Record<AppUserRole, string> = {
  admin: "/office",
  cleaner: "/jobs",
  customer: "/account",
};

export const LS_USER_ROLE_KEY = "shalean_user_role";
export const LS_DASHBOARD_ROUTE_KEY = "shalean_dashboard_route";

/** Post-login role lookup — allow slow dev cold-starts (Next.js route compile). */
export const ROLE_FETCH_TIMEOUT_MS = 8_000;

export function isAppUserRole(raw: string | null | undefined): raw is AppUserRole {
  return raw === "admin" || raw === "cleaner" || raw === "customer";
}

export function dashboardRouteForRole(role: AppUserRole): string {
  return ROLE_DASHBOARD_ROUTES[role];
}

export function readCachedUserRole(): AppUserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_USER_ROLE_KEY);
    return isAppUserRole(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readCachedDashboardRoute(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_DASHBOARD_ROUTE_KEY)?.trim();
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  } catch {
    return null;
  }
}

export function cacheUserRole(role: AppUserRole): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_USER_ROLE_KEY, role);
    window.localStorage.setItem(LS_DASHBOARD_ROUTE_KEY, dashboardRouteForRole(role));
  } catch {
    /** ignore quota / private mode */
  }
}

export function clearCachedUserRole(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_USER_ROLE_KEY);
    window.localStorage.removeItem(LS_DASHBOARD_ROUTE_KEY);
  } catch {
    /** ignore */
  }
}

/** Safe in-app redirect for post-login (blocks open redirects and legacy dashboard paths). */
export function safePostLoginRedirect(raw: string | null | undefined, role: AppUserRole): string {
  const fallback = dashboardRouteForRole(role);
  const t = String(raw ?? "").trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;

  if (t.startsWith("/admin") || t.startsWith("/cleaner")) return fallback;

  if (role === "admin" && t.startsWith("/office")) return t;
  if (role === "cleaner" && t.startsWith("/jobs")) return t;
  if (role === "customer" && t.startsWith("/account")) return t;
  if (role === "customer" && !t.startsWith("/jobs") && !t.startsWith("/office")) return t;

  return fallback;
}
