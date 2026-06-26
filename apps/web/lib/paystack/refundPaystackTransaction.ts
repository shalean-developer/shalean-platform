import "server-only";

import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { getPaystackSecretKeyCandidates } from "@/lib/paystack/paystackSecretKeys";

export type RefundPaystackTransactionResult =
  | { ok: true; refundReference: string; alreadyReversed?: boolean }
  | { ok: false; error: string };

export function isPaystackAlreadyRefundedMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("fully reversed") ||
    m.includes("already been refunded") ||
    m.includes("already reversed") ||
    m.includes("transaction has been fully reversed")
  );
}

export function isPaystackTransactionReversedStatus(status: string | undefined): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "reversed" || s === "reversal-pending";
}

export async function fetchPaystackTransactionReversalState(
  transactionReference: string,
): Promise<{ found: boolean; reversed: boolean; reference: string | null }> {
  const reference = transactionReference.trim();
  if (!reference) return { found: false, reversed: false, reference: null };

  for (const key of getPaystackSecretKeyCandidates()) {
    const verify = await fetchPaystackTransactionVerify(reference, key.secret);
    if (verify.status !== true || !verify.data) continue;
    return {
      found: true,
      reversed: isPaystackTransactionReversedStatus(verify.data.status),
      reference: String(verify.data.reference ?? reference).trim() || reference,
    };
  }

  return { found: false, reversed: false, reference: null };
}

async function createPaystackRefund(
  secret: string,
  params: {
    transactionReference: string;
    amountCents?: number;
    merchantNote?: string;
  },
): Promise<RefundPaystackTransactionResult> {
  const reference = params.transactionReference.trim();
  const body: Record<string, unknown> = { transaction: reference };
  if (params.amountCents != null && params.amountCents > 0) {
    body.amount = Math.round(params.amountCents);
  }
  if (params.merchantNote?.trim()) {
    body.merchant_note = params.merchantNote.trim().slice(0, 500);
  }

  const res = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { transaction?: { reference?: string }; id?: number };
  };

  const message = String(json.message ?? "");
  if (!json.status) {
    if (isPaystackAlreadyRefundedMessage(message)) {
      return { ok: true, refundReference: reference, alreadyReversed: true };
    }
    return { ok: false, error: message || "paystack_refund_failed" };
  }

  const refundReference =
    (typeof json.data?.transaction?.reference === "string" && json.data.transaction.reference) ||
    (json.data?.id != null ? String(json.data.id) : reference);

  return { ok: true, refundReference };
}

/**
 * Initiate a Paystack refund for a successful charge reference.
 * Tries all configured secret keys and treats already-reversed charges as success.
 * @see https://paystack.com/docs/api/refund/
 */
export async function refundPaystackTransaction(params: {
  transactionReference: string;
  amountCents?: number;
  merchantNote?: string;
}): Promise<RefundPaystackTransactionResult> {
  const keys = getPaystackSecretKeyCandidates();
  if (keys.length === 0) return { ok: false, error: "paystack_not_configured" };

  const reference = params.transactionReference.trim();
  if (!reference) return { ok: false, error: "missing_transaction_reference" };

  const reversal = await fetchPaystackTransactionReversalState(reference);
  if (reversal.found && reversal.reversed) {
    return {
      ok: true,
      refundReference: reversal.reference ?? reference,
      alreadyReversed: true,
    };
  }

  let lastError = "paystack_refund_failed";
  for (const key of keys) {
    const result = await createPaystackRefund(key.secret, params);
    if (result.ok) return result;
    lastError = result.error;
    if (isPaystackAlreadyRefundedMessage(result.error)) {
      return { ok: true, refundReference: reference, alreadyReversed: true };
    }
  }

  return { ok: false, error: lastError };
}
