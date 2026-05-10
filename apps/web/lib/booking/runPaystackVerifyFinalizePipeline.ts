import "server-only";

import { enqueuePaystackRecoveryFailedJobs } from "@/lib/booking/enqueuePaystackRecoveryFailedJobs";
import { finalizePaidBooking, upsertResultFromFinalizePaidBookingOp } from "@/lib/booking/bookingOperations";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import {
  bookingIdForPaystackReference,
  resolveInternalBookingIdFromPaystackReference,
  assertDecoupledPaystackMetadataAllowsFinalize,
} from "@/lib/booking/paystackBookingIdLookup";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { metrics } from "@/lib/metrics/counters";
import {
  expectedCheckoutZarFromVerify,
  pricingVersionIdFromLocked,
  recordPaystackPricingMismatch,
} from "@/lib/metrics/pricingMismatch";
import { sendCustomerBookingPaymentProcessingEmail } from "@/lib/email/sendBookingEmail";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";

/**
 * Paystack transaction payload from `transaction/verify` (shared by `/api/paystack/verify` and `/api/payments/verify`).
 */
export type PaystackChargeVerifyTx = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  customer?: { email?: string; customer_code?: string };
  authorization?: { authorization_code?: string };
  metadata?: Record<string, unknown>;
};

export type PaystackVerifyFinalizePipelineResult = {
  result: UpsertBookingFromPaystackResult;
  metadata: Record<string, string | undefined>;
  snapshot: BookingSnapshotV1 | null;
  email: string;
  ref: string;
  amount: number;
  currency: string;
  assignmentType: string | null;
  fallbackReason: string | null;
  attemptedCleanerId: string | null;
  assignedCleanerId: string | null;
  selectedCleanerId: string | null;
};

/**
 * Paystack `charge.success` / verify success only: parse metadata, call {@link finalizePaidBooking}
 * (`finalizePaystackChargeSuccess` → `upsertBookingFromPaystack`), enqueue recovery, optional processing email.
 *
 * @param opsLogSource e.g. `paystack/verify` or `payments/verify` for structured logs.
 */
export async function runPaystackVerifyFinalizePipeline(
  tx: PaystackChargeVerifyTx,
  referenceInput: string,
  opsLogSource: string,
): Promise<PaystackVerifyFinalizePipelineResult> {
  const amount = typeof tx.amount === "number" ? tx.amount : 0;
  const currency = typeof tx.currency === "string" ? tx.currency : "ZAR";
  const authorizationCode =
    tx && typeof tx === "object" && tx.authorization && typeof tx.authorization === "object"
      ? String((tx.authorization as { authorization_code?: string }).authorization_code ?? "")
      : "";
  const customerCode =
    tx && typeof tx === "object" && tx.customer && typeof tx.customer === "object"
      ? String((tx.customer as { customer_code?: string }).customer_code ?? "")
      : "";
  const metadata = normalizePaystackMetadata(tx.metadata);
  notifyBookingDebug("paystack_verify_metadata", {
    reference: tx.reference ?? referenceInput,
    metadataKeys: Object.keys(metadata ?? {}),
    verifyRoute: opsLogSource,
  });
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const ref = tx.reference ?? referenceInput;
  assertDecoupledPaystackMetadataAllowsFinalize(ref, metadata);

  const expectedZar = expectedCheckoutZarFromVerify(snapshot, metadata);
  let bookingIdForTrace = resolveInternalBookingIdFromPaystackReference(ref, metadata);
  if (!bookingIdForTrace) {
    const admin = getSupabaseAdmin();
    if (admin) {
      bookingIdForTrace = await bookingIdForPaystackReference(admin, ref);
      if (bookingIdForTrace) {
        metrics.increment("checkout.paystack_booking_id_db_fallback", {
          bookingId: bookingIdForTrace,
          reference: ref,
        });
      }
    }
  }
  if (expectedZar != null) {
    recordPaystackPricingMismatch({
      expectedZar,
      amountCents: amount,
      bookingId: bookingIdForTrace,
      pricingVersionId: pricingVersionIdFromLocked(snapshot?.locked),
      reference: ref,
    });
  }

  const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
  const emailRaw =
    emailFromCustomer || (typeof metadata.customer_email === "string" ? metadata.customer_email : "") || "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (process.env.NODE_ENV !== "production" || process.env.TRACE_PAYSTACK_METADATA === "1") {
    console.log("[VERIFY → UPSERT TRIGGERED]", { opsLogSource, reference: ref, metadata: tx.metadata });
  }

  const finalizeOp = await finalizePaidBooking({
    source: "verify",
    paystackReference: ref,
    amountCents: amount,
    currency,
    customerEmail: email,
    snapshot,
    paystackMetadata: metadata,
    paystackAuthorizationCode: authorizationCode || null,
    paystackCustomerCode: customerCode || null,
    paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
  });
  const result = upsertResultFromFinalizePaidBookingOp(finalizeOp);

  const adm = getSupabaseAdmin();
  let assignmentType: string | null = null;
  let fallbackReason: string | null = null;
  let attemptedCleanerId: string | null = null;
  let assignedCleanerId: string | null = null;
  let selectedCleanerId: string | null = null;
  if (result.bookingId && adm) {
    const { data: ar } = await adm
      .from("bookings")
      .select("assignment_type, fallback_reason, cleaner_id, selected_cleaner_id, attempted_cleaner_id")
      .eq("id", result.bookingId)
      .maybeSingle();
    if (ar && typeof ar === "object") {
      assignmentType = String((ar as { assignment_type?: string | null }).assignment_type ?? "").trim() || null;
      fallbackReason = String((ar as { fallback_reason?: string | null }).fallback_reason ?? "").trim() || null;
      attemptedCleanerId =
        String((ar as { attempted_cleaner_id?: string | null }).attempted_cleaner_id ?? "").trim() || null;
      assignedCleanerId = String((ar as { cleaner_id?: string | null }).cleaner_id ?? "").trim() || null;
      selectedCleanerId = String((ar as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim() || null;
    }
  }

  if (result.error) {
    await reportOperationalIssue("critical", opsLogSource, `payment verified success but booking upsert failed: ${result.error}`, {
      reference: ref,
    });
  }

  if (result.bookingId && !result.error) {
    await logSystemEvent({
      level: "info",
      source: opsLogSource,
      message: "paystack.booking.created",
      context: { reference: ref, bookingId: result.bookingId, skipped: result.skipped },
    });
  }

  await enqueuePaystackRecoveryFailedJobs({
    reference: ref,
    result,
    basePayload: {
      paystackReference: ref,
      amountCents: amount,
      currency,
      customerEmail: email,
      snapshot,
      paystackMetadata: metadata,
    },
  });

  if (email && !result.bookingId) {
    const cust = await sendCustomerBookingPaymentProcessingEmail({
      customerEmail: email,
      paymentReference: ref,
    });
    if (!cust.sent && cust.error) {
      await reportOperationalIssue("error", opsLogSource, `processing ack email not sent: ${cust.error}`, {
        reference: ref,
      });
    }
  }

  return {
    result,
    metadata,
    snapshot,
    email,
    ref,
    amount,
    currency,
    assignmentType,
    fallbackReason,
    attemptedCleanerId,
    assignedCleanerId,
    selectedCleanerId,
  };
}
