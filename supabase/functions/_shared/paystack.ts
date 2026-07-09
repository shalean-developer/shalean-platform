/**
 * @module _shared/paystack
 * @status CONTRACT ONLY
 *
 * Paystack API helpers for Edge Functions.
 * Ports from:
 * - apps/web/lib/payments/verifyPaystackTransaction.ts
 * - apps/web/lib/recurring/chargePaystackAuthorization.ts
 * - apps/web/lib/paystack/refundPaystackTransaction.ts
 */

export type PaystackVerifyResult = {
  ok: boolean;
  reference: string;
  amountCents: number;
  metadata: Record<string, unknown>;
  error?: string;
};

export async function verifyPaystackTransaction(
  _reference: string,
  _secretKey: string,
): Promise<PaystackVerifyResult> {
  throw new Error("Not implemented");
}

export async function chargePaystackAuthorization(_params: {
  authorizationCode: string;
  amountCents: number;
  email: string;
  reference: string;
  secretKey: string;
}): Promise<{ ok: boolean; reference?: string; error?: string }> {
  throw new Error("Not implemented");
}
