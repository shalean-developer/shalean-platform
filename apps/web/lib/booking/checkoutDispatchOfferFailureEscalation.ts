import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

/**
 * When post-pay `createDispatchOfferRow` fails, the booking stays `pending_assignment` with no pending offer.
 * Recovery cron can eventually run {@link maybeRedispatchPendingBookingIfOffersExhausted}, but ops need an immediate signal.
 */
export async function escalateFailedCheckoutDispatchOffer(params: {
  supabase: SupabaseClient;
  bookingId: string;
  paystackReference: string;
  cleanerId: string;
  offerError: string;
}): Promise<void> {
  const { supabase, bookingId, paystackReference, cleanerId, offerError } = params;

  metrics.increment("booking.checkout_dispatch_offer_insert_failed", {
    bookingId,
    cleanerId,
    reference: paystackReference,
  });

  await reportOperationalIssue("warn", "checkoutDispatchOfferFailureEscalation", offerError, {
    bookingId,
    cleanerId,
    paystackReference,
  });

  await logSystemEvent({
    level: "warn",
    source: "checkout_dispatch_offer_insert",
    message: offerError.slice(0, 500),
    context: { bookingId, cleanerId, paystackReference },
  });

  await postDispatchControlAlert(
    {
      errorType: "checkout_dispatch_offer_insert_failed",
      message: `Checkout dispatch offer insert failed after payment: ${offerError.slice(0, 300)}`,
      bookingId,
      cleanerId,
      dedupeKey: `checkout_offer_failed:${bookingId}`,
      dedupeWindowMinutes: 60,
      extra: { paystackReference, cleanerId, offerError: offerError.slice(0, 500) },
    },
    { supabase },
  );

  const { error: updErr } = await supabase
    .from("bookings")
    .update({ payment_needs_follow_up: true })
    .eq("id", bookingId);

  if (updErr) {
    await reportOperationalIssue("warn", "checkoutDispatchOfferFailureEscalation", updErr.message, {
      bookingId,
      hint: "payment_needs_follow_up",
    });
  }
}
