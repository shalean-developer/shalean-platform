export type PaystackVerifyTxData = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  fees?: number;
  fees_breakdown?: unknown;
  channel?: string;
  id?: number | string;
  international_format_transaction?: boolean;
  authorization?: { country_code?: string };
  metadata?: Record<string, unknown>;
};

export type PaystackVerifyJson = {
  status?: boolean;
  message?: string;
  data?: PaystackVerifyTxData;
};

export async function fetchPaystackTransactionVerify(reference: string, secret: string): Promise<PaystackVerifyJson> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(12_000),
    });
    return (await res.json()) as PaystackVerifyJson;
  } catch (err) {
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    return {
      status: false,
      message: aborted ? "Paystack verify timed out." : err instanceof Error ? err.message : "Paystack verify failed.",
    };
  }
}
