import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

export type CashFlowPaymentRow = {
  id: string;
  gateway_reference: string;
  gateway_transaction_id: string | null;
  amount_cents: number;
  processing_fee_cents: number | null;
  fee_calculation_method: string | null;
  currency_code: string;
  payment_channel: string | null;
};

export function summarizeCashFlowPaymentEvidence(input: CashFlowPaymentRow[]) {
  // Refunds are outflows; they cannot establish receipt or fee completeness.
  const rows = input.filter((row) => row.payment_channel !== "refund");
  let gross = 0;
  let fees = 0;
  let unverifiedPayments = 0;
  let unverifiedFees = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.gateway_reference || seen.has(row.gateway_reference)) {
      throw new Error("Duplicate or missing payment reference; cash-flow receipts require reconciliation.");
    }
    seen.add(row.gateway_reference);
    if (row.currency_code !== "ZAR") throw new Error("Unsupported payment currency in ZAR cash flow.");
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0) {
      throw new Error("Invalid payment amount; cash-flow receipts require reconciliation.");
    }
    if (!row.gateway_transaction_id?.trim()) {
      unverifiedPayments += 1;
      continue;
    }
    gross += row.amount_cents;
    if (row.fee_calculation_method !== "paystack_reported" ||
        !Number.isSafeInteger(row.processing_fee_cents) ||
        Number(row.processing_fee_cents) < 0 || Number(row.processing_fee_cents) > row.amount_cents) {
      unverifiedFees += 1;
      continue;
    }
    fees += Number(row.processing_fee_cents);
  }
  return {
    gross_cents: gross,
    reported_fee_cents: fees,
    transaction_count: rows.length,
    verified_transaction_count: rows.length - unverifiedPayments,
    unverified_payment_count: unverifiedPayments,
    unverified_fee_count: unverifiedFees,
    // An empty local ledger cannot establish that no provider fees exist.
    fees_verified: rows.length > 0 && unverifiedPayments === 0 && unverifiedFees === 0,
  };
}

/** Recorded provider receipts by payment date; never substitute booking/service value. */
export async function loadCashFlowPaymentEvidence(admin: SupabaseClient, from: string, to: string) {
  // Johannesburg is UTC+02 year-round. Use an exclusive end to preserve subsecond payments.
  const start = new Date(`${from}T00:00:00+02:00`).toISOString();
  const end = new Date(Date.parse(`${to}T00:00:00+02:00`) + 86_400_000).toISOString();
  const rows = await fetchAllPayoutRows<CashFlowPaymentRow>((a, b) => admin
    .from("payment_transactions")
    .select("id, gateway_reference, gateway_transaction_id, amount_cents, processing_fee_cents, fee_calculation_method, currency_code, payment_channel")
    .eq("gateway", "paystack")
    .gte("paid_at", start).lt("paid_at", end)
    .order("id").range(a, b));
  return summarizeCashFlowPaymentEvidence(rows);
}
