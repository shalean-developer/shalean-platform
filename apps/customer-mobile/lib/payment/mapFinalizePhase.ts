import type {
  PaymentFinalizeResult,
  PaystackStatusResponse,
  PaystackVerifyResponse,
} from "@/features/payment/types";

function isPersistedVerify(data: Extract<PaystackVerifyResponse, { success: true }>): boolean {
  return Boolean(data.bookingId?.trim()) && data.bookingInDatabase === true;
}

function statusLeftPendingPayment(status: string | undefined | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return Boolean(s) && s !== "pending_payment" && s !== "unknown";
}

/**
 * Map a successful verify response (and optional status poll) to a finalize phase.
 * Webhook remains authority — never invents "paid" without server signals.
 */
export function mapVerifySuccessToPhase(
  data: Extract<PaystackVerifyResponse, { success: true }>,
  status?: PaystackStatusResponse | null,
): PaymentFinalizeResult {
  const bookingId = data.bookingId?.trim() || status?.bookingId?.trim() || null;
  const bookingReference = data.bookingReference?.trim() || null;

  if (isPersistedVerify(data) || statusLeftPendingPayment(status?.status)) {
    return {
      phase: "success",
      bookingId,
      bookingReference,
      errorMessage: null,
      paymentStatus: "success",
    };
  }

  return {
    phase: "persist_pending",
    bookingId,
    bookingReference,
    errorMessage: null,
    paymentStatus: "success",
  };
}

export function mapVerifyFailureToPhase(
  data: Extract<PaystackVerifyResponse, { success: false }>,
  exhaustedRetries: boolean,
): PaymentFinalizeResult | null {
  if (data.paymentStatus === "failed") {
    return {
      phase: "failed",
      bookingId: null,
      bookingReference: null,
      errorMessage: data.error?.trim() || "Payment was not successful.",
      paymentStatus: "failed",
    };
  }

  if (data.paymentStatus === "pending" && !exhaustedRetries) {
    return null;
  }

  if (data.paymentStatus === "pending" && exhaustedRetries) {
    return {
      phase: "needs_retry",
      bookingId: null,
      bookingReference: null,
      errorMessage: data.error?.trim() || "Payment is still processing.",
      paymentStatus: "pending",
    };
  }

  if (!exhaustedRetries) return null;

  const raw = data.error?.trim() || "Could not verify payment.";
  const friendly = /reference not found/i.test(raw)
    ? "Paystack could not find this payment. Usually the app charged with a test key but verified against live (or the other way around). Pay again with a matching key, or retry verify in a moment if you just paid."
    : raw;

  return {
    phase: "needs_retry",
    bookingId: null,
    bookingReference: null,
    errorMessage: friendly,
    paymentStatus: data.paymentStatus ?? "unknown",
  };
}
