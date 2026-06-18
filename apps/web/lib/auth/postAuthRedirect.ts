import type { AppUserRole } from "@/lib/auth/userRole";
import { dashboardRouteForRole, safePostLoginRedirect } from "@/lib/auth/userRole";
import type { AuthRoleIntent } from "@/lib/auth/authRoleIntent";

/** @deprecated Prefer {@link safePostLoginRedirect} */
export function safeCustomerRedirect(raw: string): string {
  return safePostLoginRedirect(raw, "customer");
}

/**
 * Legacy redirect helper — prefer {@link resolvePostAuthDestination} with `user_profiles.role`.
 * Kept for tests and callers that already have a resolved role.
 */
export function computePostAuthRedirect(args: {
  role: AppUserRole;
  redirect: string;
  intent?: AuthRoleIntent | null;
}): string {
  const { role, redirect, intent } = args;

  if (role === "admin") {
    return safePostLoginRedirect(redirect.startsWith("/office") ? redirect : "", "admin");
  }

  if (role === "cleaner") {
    if (intent === "customer" && redirect.startsWith("/account")) {
      return safePostLoginRedirect(redirect, "customer");
    }
    return safePostLoginRedirect(redirect.startsWith("/jobs") ? redirect : "", "cleaner");
  }

  return safePostLoginRedirect(redirect, "customer");
}

export function defaultDashboardForRole(role: AppUserRole): string {
  return dashboardRouteForRole(role);
}
