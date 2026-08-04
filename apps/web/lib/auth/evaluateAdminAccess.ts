import "server-only";

import { isAdmin, isAdminAllowlistConfigured } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AdminAccessDecision =
  | { ok: true; via: "allowlist" | "profile_role" | "rbac_assignment" }
  | { ok: false; status: 403 | 503; error: string };

/**
 * Authorize Office admin API access.
 *
 * Active granular RBAC assignments are the primary source of truth. The
 * legacy `user_profiles.role === "admin"` value and ADMIN_EMAILS allowlist are
 * retained only for backwards-compatible bootstrap and recovery access.
 */
export async function evaluateAdminAccess(params: {
  userId: string;
  email?: string | null;
}): Promise<AdminAccessDecision> {
  const userId = params.userId.trim();
  if (!userId) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  const email = String(params.email ?? "").trim();
  if (email && isAdmin(email)) {
    return { ok: true, via: "allowlist" };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    if (!isAdminAllowlistConfigured()) {
      return {
        ok: false,
        status: 503,
        error:
          "Admin access cannot be verified (missing service role). Set SUPABASE_SERVICE_ROLE_KEY, or configure ADMIN_EMAILS as a temporary allowlist.",
      };
    }
    return { ok: false, status: 403, error: "Forbidden." };
  }

  const now = new Date().toISOString();
  const { data: activeAssignments, error: assignmentError } = await admin
    .from("admin_user_roles")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1);

  if (assignmentError) {
    return { ok: false, status: 503, error: "Unable to verify admin access." };
  }
  if ((activeAssignments ?? []).length > 0) {
    return { ok: true, via: "rbac_assignment" };
  }

  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 503, error: "Unable to verify admin access." };
  }

  const role = String((profile as { role?: string | null } | null)?.role ?? "")
    .trim()
    .toLowerCase();
  if (role === "admin") {
    return { ok: true, via: "profile_role" };
  }

  return { ok: false, status: 403, error: "Forbidden." };
}

/**
 * After `auth.getUser`, authorize an Office admin via active RBAC assignment,
 * legacy profile role, or emergency email allowlist.
 */
export async function requireAdminUser(
  user: { id: string; email?: string | null } | null | undefined,
): Promise<
  { ok: true; userId: string; email: string } | { ok: false; status: number; error: string }
> {
  if (!user?.id) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }
  if (!user.email) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  const access = await evaluateAdminAccess({ userId: user.id, email: user.email });
  if (!access.ok) return { ok: false, status: access.status, error: access.error };
  return { ok: true, userId: user.id, email: user.email };
}
