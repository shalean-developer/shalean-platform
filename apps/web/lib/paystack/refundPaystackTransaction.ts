import "server-only";

export type RefundPaystackTransactionResult =
  | { ok: true; refundReference: string }
  | { ok: false; error: string };

/**
 * Initiate a Paystack refund for a successful charge reference.
 * @see https://paystack.com/docs/api/refund/
 */
export async function refundPaystackTransaction(params: {
  transactionReference: string;
  amountCents?: number;
  merchantNote?: string;
}): Promise<RefundPaystackTransactionResult> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "paystack_not_configured" };

  const reference = params.transactionReference.trim();
  if (!reference) return { ok: false, error: "missing_transaction_reference" };

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

  if (!json.status) {
    return { ok: false, error: String(json.message ?? "paystack_refund_failed") };
  }

  const refundReference =
    (typeof json.data?.transaction?.reference === "string" && json.data.transaction.reference) ||
    (json.data?.id != null ? String(json.data.id) : reference);

  return { ok: true, refundReference };
}
