import "server-only";

import { enqueueFailedJob, type BookingInsertFailedPayload, type PaymentMismatchFailedPayload } from "@/lib/booking/failedJobs";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

function shouldRunRecoveryEnqueue(result: UpsertBookingFromPaystackResult): boolean {
  return (
    !result.bookingId ||
    (result.reason === "amount_mismatch" && result.recoveryEnqueue === true) ||
    (result.reason === "finalization_failed" && result.recoveryEnqueue === true)
  );
}

/**
 * Maps Paystack finalize outcomes to `failed_jobs` without misclassifying terminal rows as `booking_insert`.
 */
export async function enqueuePaystackRecoveryFailedJobs(input: {
  reference: string;
  result: UpsertBookingFromPaystackResult;
  basePayload: BookingInsertFailedPayload;
}): Promise<void> {
  const { reference, result, basePayload } = input;
  if (!shouldRunRecoveryEnqueue(result)) return;

  if (!result.bookingId) {
    const ok = await enqueueFailedJob("booking_insert", basePayload);
    if (!ok) {
      console.error("[CRITICAL BOOKING FAILURE]", { reference, reason: "booking_insert_enqueue_failed" });
    }
  }

  if (result.reason === "amount_mismatch" && result.recoveryEnqueue === true) {
    const mismatchPayload: PaymentMismatchFailedPayload = {
      paystackReference: basePayload.paystackReference,
      bookingId: result.bookingId,
      amountCents: basePayload.amountCents,
      currency: basePayload.currency,
    };
    const ok = await enqueueFailedJob("payment_mismatch", mismatchPayload);
    if (!ok) {
      await reportOperationalIssue("critical", "enqueuePaystackRecoveryFailedJobs", "payment_mismatch failed_jobs enqueue failed", {
        reference,
        bookingId: result.bookingId,
      });
    }
  }

  if (result.reason === "finalization_failed" && result.recoveryEnqueue === true) {
    const ok = await enqueueFailedJob("payment_reconciliation", basePayload);
    if (!ok) {
      console.error("[CRITICAL BOOKING FAILURE]", { reference, reason: "payment_reconciliation_enqueue_failed" });
    }
  }
}
