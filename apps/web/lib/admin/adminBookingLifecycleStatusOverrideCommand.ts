import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplyAdminBookingLifecycleStatusOverrideParams = {
  admin: SupabaseClient;
  bookingId: string;
  updates: Record<string, unknown>;
};

/**
 * Command boundary for generic admin PATCH lifecycle status overrides.
 * Phase 1E preserves the existing update payload and booking id condition.
 */
export async function applyAdminBookingLifecycleStatusOverride(
  params: ApplyAdminBookingLifecycleStatusOverrideParams,
): Promise<{ error: { message: string } | null }> {
  const { error } = await params.admin.from("bookings").update(params.updates).eq("id", params.bookingId);
  return { error };
}
