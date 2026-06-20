import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchBookingCancelledNotifications } from "@/lib/notifications/bookingCancelledNotifications";

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
  if (error) return { error };

  const nextStatus = String(params.updates.status ?? "").trim().toLowerCase();
  if (nextStatus === "cancelled") {
    void dispatchBookingCancelledNotifications(params.admin, { bookingId: params.bookingId });
  }

  return { error: null };
}
