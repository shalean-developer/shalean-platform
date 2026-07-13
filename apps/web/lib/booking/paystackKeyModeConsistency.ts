import "server-only";

import { PAYMENT_ERROR_CODES, type PaymentErrorCode } from "@/lib/booking/paymentErrorCodes";
import { getPaystackPublicKey } from "@/lib/payments/paystackPublicKey";

function modeFromSecret(secret: string): "live" | "test" | "unknown" {
  if (secret.startsWith("sk_live_")) return "live";
  if (secret.startsWith("sk_test_")) return "test";
  return "unknown";
}

function modeFromPublic(pub: string): "live" | "test" | "unknown" {
  if (pub.startsWith("pk_live_")) return "live";
  if (pub.startsWith("pk_test_")) return "test";
  return "unknown";
}

/**
 * Detects mismatched Paystack live/test secret vs public key pairs.
 * Returns null when configuration is usable.
 */
export function detectPaystackKeyModeMismatch(): {
  errorCode: PaymentErrorCode;
  error: string;
} | null {
  const secret = (process.env.PAYSTACK_SECRET_KEY ?? "").trim();
  const pub = getPaystackPublicKey();
  if (!secret) {
    return {
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_CONFIGURATION_ERROR,
      error: "Paystack secret key is not configured.",
    };
  }
  if (!pub) {
    // Server redirect checkout can work without a public key; warn only when both are set inconsistently.
    return null;
  }
  const secretMode = modeFromSecret(secret);
  const pubMode = modeFromPublic(pub);
  if (secretMode === "unknown" || pubMode === "unknown") return null;
  if (secretMode !== pubMode) {
    return {
      errorCode: PAYMENT_ERROR_CODES.PAYMENT_CONFIGURATION_ERROR,
      error: `Paystack key mode mismatch: secret is ${secretMode} but public key is ${pubMode}.`,
    };
  }
  return null;
}
