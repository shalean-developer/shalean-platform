import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelUnsentBookingLifecycleJobs } from "@/lib/booking/cancelUnsentBookingLifecycleJobs";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { expirePendingDispatchOffersForBooking } from "@/lib/dispatch/expirePendingDispatchOffersForBooking";

export type CustomerCancellationOrchestrationResult =
  | { ok: true; expiredOffers: number }
  | { ok: false; error: string };

/**
 * Canonical operational side-effects for a customer cancellation.
 *
 * The booking row itself is mutated by the caller after policy/ownership checks.
 * This helper converges the async rails that otherwise keep acting on a booking
 * after it has been cancelled: dispatch offers/retries and queued lifecycle or
 * payment-recovery messages. Historical roster/assignment rows are preserved.
 */
export async function orchestrateCustomerBookingCancellation(
  admin: SupabaseClient,
  bookingId: string,
): Promise<CustomerCancellationOrchestrationResult> {
  const { expiredCount, error: offerExpireErr } = await expirePendingDispatchOffersForBooking(admin, bookingId);
  if (offerExpireErr) return { ok: false, error: offerExpireErr };

  const now = new Date().toISOString();
  const { error: retryErr } = await admin
    .from("dispatch_retry_queue")
    .update({ status: "cancelled", processed_at: now })
    .eq("booking_id", bookingId)
    .in("status", ["pending", "processing"]);
  if (retryErr) return { ok: false, error: retryErr.message };

  await Promise.all([
    cancelUnsentBookingLifecycleJobs(admin, bookingId),
    cancelUnsentBookingPaymentRecoveryJobs(admin, bookingId, "booking_cancelled"),
  ]);

  return { ok: true, expiredOffers: expiredCount };
}
