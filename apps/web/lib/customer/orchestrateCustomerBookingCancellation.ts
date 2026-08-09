import type { SupabaseClient } from "@supabase/supabase-js";

import { cancelUnsentBookingLifecycleJobs } from "@/lib/booking/cancelUnsentBookingLifecycleJobs";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { expirePendingDispatchOffersForBooking } from "@/lib/dispatch/expirePendingDispatchOffersForBooking";

export type CustomerCancellationOrchestrationResult =
  | { ok: true; expiredOffers: number; refundReviewCaseCreated: boolean }
  | { ok: false; error: string };

async function ensurePaidCancellationRefundReviewCase(
  admin: SupabaseClient,
  bookingId: string,
  actorUserId?: string | null,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id,customer_id,crm_customer_id,customer_email,customer_phone,amount_paid_cents,total_paid_zar,payment_status,refund_status,monthly_invoice_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!booking) return { ok: false, error: "booking_not_found" };

  const paidCents = Number(booking.amount_paid_cents ?? 0) > 0
    ? Number(booking.amount_paid_cents ?? 0)
    : Math.round(Number(booking.total_paid_zar ?? 0) * 100);
  const paymentStatus = String(booking.payment_status ?? "").toLowerCase();
  const refundStatus = String(booking.refund_status ?? "").toLowerCase();
  const hasCapturedPayment = paidCents > 0 || ["success", "paid"].includes(paymentStatus);
  const refundComplete = ["full", "refunded", "reversed", "chargeback"].includes(refundStatus);
  if (!hasCapturedPayment || refundComplete) return { ok: true, created: false };

  const { data: existing, error: existingError } = await admin
    .from("customer_care_cases")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("category", "refund")
    .in("status", ["open", "investigating", "waiting_customer", "waiting_internal"])
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  if (existing?.id) return { ok: true, created: false };

  const now = Date.now();
  const amountLabel = paidCents > 0 ? `R${(paidCents / 100).toFixed(2)}` : "a captured payment";
  const { error: insertError } = await admin.from("customer_care_cases").insert({
    booking_id: bookingId,
    customer_id: actorUserId ?? booking.customer_id ?? null,
    crm_customer_id: booking.crm_customer_id ?? null,
    customer_email: booking.customer_email ?? null,
    customer_phone: booking.customer_phone ?? null,
    category: "refund",
    priority: "high",
    status: "open",
    subject: "Cancellation payment review",
    description: `Customer cancelled a paid booking with ${amountLabel}. Review cancellation policy, refund eligibility and any invoice impact before moving money.`,
    assigned_to: null,
    created_by: actorUserId ?? null,
    first_response_due_at: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    resolution_due_at: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    metadata: {
      source: "customer_cancellation_orchestrator",
      monthly_invoice_id: booking.monthly_invoice_id ?? null,
      captured_amount_cents: paidCents,
    },
  });
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, created: true };
}

/**
 * Canonical operational side-effects for a customer cancellation.
 * The booking mutation remains authoritative; this converges dispatch, queued
 * messages and finance review without making an automatic refund-policy decision.
 */
export async function orchestrateCustomerBookingCancellation(
  admin: SupabaseClient,
  bookingId: string,
  options?: { actorUserId?: string | null },
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

  const refundReview = await ensurePaidCancellationRefundReviewCase(admin, bookingId, options?.actorUserId);
  if (!refundReview.ok) return { ok: false, error: refundReview.error };

  return { ok: true, expiredOffers: expiredCount, refundReviewCaseCreated: refundReview.created };
}
