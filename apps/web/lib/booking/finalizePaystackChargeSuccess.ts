import "server-only";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import { recordReferralCheckoutRedemption } from "@/lib/referrals/validateReferral";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type PaystackPersistSource = "verify" | "webhook" | "retry";

export type FinalizePaystackChargeSuccessParams = {
  source: PaystackPersistSource;
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
  paystackMetadata: Record<string, string | undefined>;
  paystackAuthorizationCode: string | null;
  paystackCustomerCode: string | null;
  paidAtIso: string | null;
};

/**
 * Single path for Paystack `charge.success` / verify-after-success: upsert booking, redeem referral, notify.
 * Notifications and referral redemption must not throw or block persistence.
 */
export async function finalizePaystackChargeSuccess(
  params: FinalizePaystackChargeSuccessParams,
): Promise<Awaited<ReturnType<typeof upsertBookingFromPaystack>>> {
  let result: Awaited<ReturnType<typeof upsertBookingFromPaystack>>;
  try {
    result = await upsertBookingFromPaystack({
      paystackReference: params.paystackReference,
      amountCents: params.amountCents,
      currency: params.currency,
      customerEmail: params.customerEmail,
      snapshot: params.snapshot,
      paystackMetadata: params.paystackMetadata,
      paystackAuthorizationCode: params.paystackAuthorizationCode,
      paystackCustomerCode: params.paystackCustomerCode,
      paidAtIso: params.paidAtIso,
      paystackPersistSource: params.source,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("critical", "finalizePaystackChargeSuccess", `upsert threw: ${msg}`, {
      reference: params.paystackReference,
      source: params.source,
    });
    result = { ok: false, skipped: false, bookingId: null, error: msg };
    void enqueueFailedJob("booking_finalize", {
      paystackReference: params.paystackReference,
      error: msg,
      payload: params.paystackMetadata,
    });
  }

  const admin = getSupabaseAdmin();
  const email = normalizeEmail(params.customerEmail || "");

  if (result.bookingId && !result.error && admin) {
    try {
      await recordReferralCheckoutRedemption({
        admin,
        metadata: params.paystackMetadata,
        bookingId: result.bookingId,
        userId: resolvePaystackUserId(params.snapshot, params.paystackMetadata),
        customerEmail: email,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/referral", msg, {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }
  }

  if (result.bookingId && email && !result.error && admin) {
    try {
      await notifyBookingEvent({
        type: "payment_confirmed",
        supabase: admin,
        bookingId: result.bookingId,
        snapshot: params.snapshot,
        customerEmail: email,
        amountCents: params.amountCents,
        paymentReference: params.paystackReference,
      });
    } catch (e) {
      console.error("[finalizePaystackChargeSuccess] notifyBookingEvent failed", e);
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/notifyBookingEvent", String(e), {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }
  }

  return result;
}
