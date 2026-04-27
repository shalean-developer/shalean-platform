import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keeps `user_profiles.primary_city_id` aligned with the customer's latest paid booking city.
 */
export async function syncUserPrimaryCityFromBooking(
  admin: SupabaseClient,
  userId: string | null | undefined,
  cityId: string | null | undefined,
): Promise<void> {
  const uid = typeof userId === "string" && userId.trim() ? userId.trim() : "";
  const cid = typeof cityId === "string" && cityId.trim() ? cityId.trim() : "";
  if (!uid || !cid) return;

  const { data: city } = await admin.from("cities").select("id").eq("id", cid).eq("is_active", true).maybeSingle();
  if (!city?.id) return;

  const ts = new Date().toISOString();
  const { data: exists } = await admin.from("user_profiles").select("id").eq("id", uid).maybeSingle();
  if (exists?.id) {
    await admin.from("user_profiles").update({ primary_city_id: cid, updated_at: ts }).eq("id", uid);
    return;
  }
  await admin.from("user_profiles").insert({
    id: uid,
    booking_count: 0,
    total_spent_cents: 0,
    primary_city_id: cid,
    updated_at: ts,
  });
}
