import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/auth/admin";
import type { AppUserRole } from "@/lib/auth/userRole";
import { isAppUserRole } from "@/lib/auth/userRole";
import { fetchCleanerRowForSupabaseAuthUser } from "@/lib/cleaner/resolveCleanerFromRequest";

export type ResolveUserRoleResult =
  | { kind: "ok"; role: AppUserRole }
  | { kind: "missing_profile" }
  | { kind: "invalid_role"; raw: string };

/**
 * Resolve the primary app role used for post-login routing.
 *
 * Active granular RBAC assignments take precedence over `user_profiles.role` so Office users
 * are routed to `/office` even when their legacy product profile is still marked `customer`.
 * When no RBAC assignment exists, fall back to the legacy profile / allow-list / cleaner logic.
 */
export async function resolveUserRoleServer(
  admin: SupabaseClient,
  params: { userId: string; email?: string | null },
): Promise<ResolveUserRoleResult> {
  const userId = params.userId.trim();
  if (!userId) return { kind: "missing_profile" };

  const nowIso = new Date().toISOString();
  const { data: activeAdminAssignments, error: adminRoleError } = await admin
    .from("admin_user_roles")
    .select("id, role:admin_roles!inner(id, is_active)")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .lte("starts_at", nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .eq("admin_roles.is_active", true)
    .limit(1);

  if (adminRoleError) {
    throw new Error(adminRoleError.message);
  }

  if (Array.isArray(activeAdminAssignments) && activeAdminAssignments.length > 0) {
    return { kind: "ok", role: "admin" };
  }

  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile || typeof profile !== "object") {
    return { kind: "missing_profile" };
  }

  const stored = String((profile as { role?: string | null }).role ?? "").trim().toLowerCase();
  if (stored && !isAppUserRole(stored)) {
    return { kind: "invalid_role", raw: stored };
  }
  if (isAppUserRole(stored)) {
    return { kind: "ok", role: stored };
  }

  let inferred: AppUserRole = "customer";
  const email = String(params.email ?? "").trim();
  if (email && isAdmin(email)) {
    inferred = "admin";
  } else {
    const cleanerRow = await fetchCleanerRowForSupabaseAuthUser(admin, userId);
    if (cleanerRow?.id) inferred = "cleaner";
  }

  void admin
    .from("user_profiles")
    .update({ role: inferred, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .then(() => undefined);

  return { kind: "ok", role: inferred };
}
