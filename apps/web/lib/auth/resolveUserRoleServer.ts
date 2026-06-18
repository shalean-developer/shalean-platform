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
 * Resolve `user_profiles.role` for routing. When the column is unset, infer from admin allowlist
 * and cleaner linkage, then persist best-effort so subsequent requests are fast.
 */
export async function resolveUserRoleServer(
  admin: SupabaseClient,
  params: { userId: string; email?: string | null },
): Promise<ResolveUserRoleResult> {
  const userId = params.userId.trim();
  if (!userId) return { kind: "missing_profile" };

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
