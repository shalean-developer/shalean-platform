import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAdmin } from "@/lib/auth/admin";
import type { AppUserRole } from "@/lib/auth/userRole";
import { fetchCleanerRowForSupabaseAuthUser } from "@/lib/cleaner/resolveCleanerFromRequest";

/** Infer app role for a new or unset user_profiles row. */
export async function inferUserProfileRole(
  admin: SupabaseClient,
  userId: string,
  loginEmail?: string | null,
): Promise<AppUserRole> {
  const email = String(loginEmail ?? "").trim().toLowerCase();
  if (email && isAdmin(email)) return "admin";

  const cleaner = await fetchCleanerRowForSupabaseAuthUser(admin, userId);
  if (cleaner?.id) return "cleaner";

  return "customer";
}

/** Set role='customer' when null, unless the user is a cleaner or admin. */
export async function backfillNullProfileRole(
  admin: SupabaseClient,
  userId: string,
  loginEmail?: string | null,
): Promise<void> {
  const { data: row } = await admin.from("user_profiles").select("role").eq("id", userId).maybeSingle();
  if (String((row as { role?: string | null } | null)?.role ?? "").trim()) return;

  const role = await inferUserProfileRole(admin, userId, loginEmail);
  await admin
    .from("user_profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .is("role", null);
}
