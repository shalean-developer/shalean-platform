import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminCustomerSearchProfileRow = {
  id: string;
  full_name: string | null;
  billing_type: string | null;
  schedule_type: string | null;
};

/**
 * Batched fetch of `user_profiles` rows for a set of user ids.
 *
 * H-13: Replaces N individual `from("user_profiles").eq("id", id).maybeSingle()`
 * calls (one per matched user) with a single `.in("id", uniqIds)` query. The
 * returned map is keyed by `id`; ids without a profile row are intentionally
 * absent so callers can apply their own safe defaults
 * (`per_booking` / `on_demand`).
 */
export async function loadUserProfilesForAdminCustomerSearch(
  admin: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, AdminCustomerSearchProfileRow>> {
  const out = new Map<string, AdminCustomerSearchProfileRow>();
  if (ids.length === 0) return out;
  const uniq = Array.from(new Set(ids.filter((s) => typeof s === "string" && s.length > 0)));
  if (uniq.length === 0) return out;

  const { data, error } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_type, schedule_type")
    .in("id", uniq);
  if (error || !data) return out;

  for (const raw of data) {
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;
    out.set(id, {
      id,
      full_name: typeof r.full_name === "string" ? r.full_name : null,
      billing_type: typeof r.billing_type === "string" ? r.billing_type : null,
      schedule_type: typeof r.schedule_type === "string" ? r.schedule_type : null,
    });
  }
  return out;
}
