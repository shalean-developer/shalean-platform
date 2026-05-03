import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import type { AuthRoleIntent } from "@/lib/auth/authRoleIntent";

export function safeCustomerRedirect(raw: string): string {
  const fallback = "/dashboard/bookings";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  return t;
}

function isCustomerSurfacePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("/cleaner")) return false;
  if (path.startsWith("/admin")) return false;
  return true;
}

/**
 * After Supabase email/password auth on the **customer** surfaces, pick a safe next URL.
 *
 * - Linked cleaner accounts default to `/cleaner/dashboard` unless the user explicitly
 *   chose the customer path and `redirect` is a normal customer URL (booking, dashboard, track).
 * - Non-cleaner sessions cannot be sent to `/cleaner/*` from this helper.
 */
export function computePostAuthRedirect(args: {
  intent: AuthRoleIntent | null;
  isCleaner: boolean;
  redirect: string;
}): string {
  const { intent, isCleaner, redirect } = args;
  const r = (redirect || "").trim() || "/dashboard/bookings";

  if (isCleaner) {
    if (r.startsWith("/cleaner")) {
      return sanitizeCleanerPostAuthRedirect(r);
    }
    if (intent === "customer" && isCustomerSurfacePath(r)) {
      return safeCustomerRedirect(r);
    }
    return "/cleaner/dashboard";
  }

  if (r.startsWith("/cleaner")) {
    return "/dashboard/bookings";
  }

  return safeCustomerRedirect(r);
}
