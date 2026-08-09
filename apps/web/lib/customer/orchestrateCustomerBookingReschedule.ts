import type { SupabaseClient } from "@supabase/supabase-js";

import { expirePendingDispatchOffersForBooking } from "@/lib/dispatch/expirePendingDispatchOffersForBooking";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";

export type CustomerRescheduleOrchestrationResult =
  | { ok: true; expiredOffers: number; redispatchStarted: boolean }
  | { ok: false; error: string };

/**
 * Converges all slot-bound dispatch state after the authoritative booking date/time changes.
 * Old offers and retry work must never survive a reschedule because they describe the prior slot.
 */
export async function orchestrateCustomerBookingReschedule(
  admin: SupabaseClient,
  bookingId: string,
): Promise<CustomerRescheduleOrchestrationResult> {
  const { expiredCount, error: offerError } = await expirePendingDispatchOffersForBooking(admin, bookingId);
  if (offerError) return { ok: false, error: offerError };

  const now = new Date().toISOString();
  const { error: retryError } = await admin
    .from("dispatch_retry_queue")
    .update({ status: "cancelled", processed_at: now })
    .eq("booking_id", bookingId)
    .in("status", ["pending", "processing"]);
  if (retryError) return { ok: false, error: retryError.message };

  const { data, error: bookingError } = await admin
    .from("bookings")
    .select("status,cleaner_id,team_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) return { ok: false, error: bookingError.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const status = String(data.status ?? "").toLowerCase();
  const hasAssignment = Boolean(data.cleaner_id || data.team_id);
  const dispatchable = ["pending", "confirmed", "assigned", "accepted"].includes(status);
  if (!hasAssignment && dispatchable && process.env.AUTO_DISPATCH_CLEANERS !== "false") {
    const assignment = await ensureBookingAssignment(admin, bookingId, { source: "customer_reschedule" });
    if (assignment && typeof assignment === "object" && "ok" in assignment && assignment.ok === false) {
      return { ok: false, error: String((assignment as { error?: unknown }).error ?? "redispatch_failed") };
    }
    return { ok: true, expiredOffers: expiredCount, redispatchStarted: true };
  }

  return { ok: true, expiredOffers: expiredCount, redispatchStarted: false };
}
