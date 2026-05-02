import "server-only";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import { recordReferralCheckoutRedemption } from "@/lib/referrals/validateReferral";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";
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

const traceFinalize =
  typeof process !== "undefined" &&
  (process.env.NODE_ENV !== "production" || process.env.TRACE_PAYSTACK_FINALIZE === "1");

/**
 * Single path for Paystack `charge.success` / verify-after-success: upsert booking, redeem referral, notify.
 * Notifications and referral redemption must not throw or block persistence.
 */
export async function finalizePaystackChargeSuccess(
  params: FinalizePaystackChargeSuccessParams,
): Promise<Awaited<ReturnType<typeof upsertBookingFromPaystack>>> {
  notifyBookingDebug("finalize_paystack_start", {
    reference: params.paystackReference,
    source: params.source,
    snapshotHasCustomerEmail: Boolean(params.snapshot?.customer?.email?.trim()),
  });

  if (traceFinalize) {
    console.log("[FINALIZE START]", {
      reference: params.paystackReference,
      amountCents: params.amountCents,
      currency: params.currency,
      source: params.source,
      snapshotLockedAt: params.snapshot?.locked?.lockedAt ?? null,
      snapshotCustomerEmail: params.snapshot?.customer?.email ?? null,
    });
  }

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
    notifyBookingDebug("finalize_paystack_upsert", {
      reference: params.paystackReference,
      ok: result.ok,
      skipped: result.skipped,
      bookingId: result.bookingId,
      error: result.error ?? null,
    });
    if (traceFinalize) {
      console.log("[UPSERT RESULT]", result);
    }
  } catch (e) {
    notifyBookingDebug("finalize_paystack_upsert_throw", {
      reference: params.paystackReference,
      message: e instanceof Error ? e.message : String(e),
    });
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
  let resolvedCustomerEmail = normalizeEmail(params.customerEmail || "");
  if ((!resolvedCustomerEmail || resolvedCustomerEmail.length < 3) && result.bookingId && admin) {
    const { data: br } = await admin
      .from("bookings")
      .select("customer_email")
      .eq("id", result.bookingId)
      .maybeSingle();
    resolvedCustomerEmail = normalizeEmail(String((br as { customer_email?: string | null })?.customer_email ?? ""));
  }
  if (!resolvedCustomerEmail || resolvedCustomerEmail.length < 3) {
    resolvedCustomerEmail = normalizeEmail(params.snapshot?.customer?.email ?? "");
  }

  if (result.bookingId && !result.error && admin) {
    try {
      await recordReferralCheckoutRedemption({
        admin,
        metadata: params.paystackMetadata,
        bookingId: result.bookingId,
        userId: resolvePaystackUserId(params.snapshot, params.paystackMetadata),
        customerEmail: resolvedCustomerEmail,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/referral", msg, {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }
  }

  // Payment notifications must run on every verify/webhook success for this reference, including
  // idempotent upsert replays (`result.skipped === true`). Upsert stays skipped; duplicate sends are
  // prevented inside `notifyBookingEvent` via `tryClaimNotificationIdempotency` (Paystack reference key).
  if (result.bookingId && !result.error && admin) {
    notifyBookingDebug("finalize_paystack_calling_notify", {
      bookingId: result.bookingId,
      skipped: result.skipped,
      reference: params.paystackReference,
      resolvedCustomerEmailSet: Boolean(resolvedCustomerEmail?.trim()),
    });
    try {
      await notifyBookingEvent({
        type: "payment_confirmed",
        supabase: admin,
        bookingId: result.bookingId,
        snapshot: params.snapshot,
        customerEmail: resolvedCustomerEmail,
        amountCents: params.amountCents,
        paymentReference: params.paystackReference,
      });
    } catch (err) {
      notifyBookingDebug("finalize_paystack_notify_throw", {
        bookingId: result.bookingId,
        message: err instanceof Error ? err.message : String(err),
      });
      await reportOperationalIssue("error", "finalizePaystackChargeSuccess/notifyBookingEvent", String(err), {
        bookingId: result.bookingId,
        reference: params.paystackReference,
      });
    }
  }

  return result;
}
