import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";

/**
 * Idempotent replay-friendly `payment_confirmed` fan-out when the booking row is already finalized.
 * Used by Paystack verify (early return) and webhook retries so delivery attempts respect
 * {@link tryClaimNotificationIdempotency} inside {@link notifyBookingEvent}.
 */
export async function replayPaymentConfirmedNotifyForPersistedBooking(params: {
  supabase: SupabaseClient;
  bookingId: string;
  paystackReference: string;
  amountCents: number;
  metadata?: Record<string, unknown> | null;
  snapshot?: BookingSnapshotV1 | null;
  /** Prefer Paystack customer email when present (verify path). */
  customerEmailHint?: string;
}): Promise<void> {
  const metaFlat = normalizePaystackMetadata(params.metadata);
  const snapshot =
    params.snapshot !== undefined
      ? params.snapshot
      : parseBookingSnapshot(metaFlat, { amountCents: params.amountCents }).snapshot;

  let customerEmail = (params.customerEmailHint ?? "").trim();
  if (!customerEmail) {
    const emailRaw =
      (typeof metaFlat.customer_email === "string" ? metaFlat.customer_email : "") || "";
    customerEmail = emailRaw ? normalizeEmail(emailRaw) : "";
  } else {
    customerEmail = normalizeEmail(customerEmail);
  }

  notifyBookingDebug("paystack_replay_payment_confirmed_notify", {
    bookingId: params.bookingId,
    reference: params.paystackReference,
  });

  try {
    await notifyBookingEvent({
      type: "payment_confirmed",
      supabase: params.supabase,
      bookingId: params.bookingId,
      snapshot,
      customerEmail,
      amountCents: params.amountCents,
      paymentReference: params.paystackReference,
    });
  } catch (err) {
    notifyBookingDebug("paystack_replay_payment_confirmed_notify_throw", {
      bookingId: params.bookingId,
      message: err instanceof Error ? err.message : String(err),
    });
    await reportOperationalIssue("error", "paystackReplayPaymentConfirmedNotify", String(err), {
      bookingId: params.bookingId,
      reference: params.paystackReference,
    });
  }
}
