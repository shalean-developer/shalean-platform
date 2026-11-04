import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

export type CashOutExpenseRow = {
  id: string;
  expense_date: string;
  amount_cents: number;
  payment_transaction_id: string | null;
  expense_categories: { name: string } | null;
  payment_transactions: { gateway: string } | null;
};

/**
 * Paystack fee expenses belong in accounting and expense reporting, but a
 * Paystack settlement is already net of processing fees. Subtracting a
 * Paystack-linked fee again from settled-bank cash understates net cash flow.
 *
 * Exclude only fees proven to be linked to a Paystack transaction. Other fees
 * and operating expenses remain real cash outflows in this scoped report.
 */
export function summarizeRecordedExpenseCash(rows: readonly CashOutExpenseRow[]) {
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  let excluded_paystack_fees_cents = 0;
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) throw new Error("Duplicate or missing expense id in Cash Flow.");
    seen.add(row.id);
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents < 0)
      throw new Error("Invalid approved expense amount in Cash Flow.");
    const category = row.expense_categories?.name?.trim().toLowerCase();
    const gateway = row.payment_transactions?.gateway?.trim().toLowerCase();
    if (category === "paystack fees" && row.payment_transaction_id && gateway === "paystack") {
      excluded_paystack_fees_cents += row.amount_cents;
      continue;
    }
    totals.set(row.expense_date, (totals.get(row.expense_date) ?? 0) + row.amount_cents);
  }
  const by_date = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cash_out_cents]) => ({ date, cash_out_cents }));
  return {
    cash_out_cents: by_date.reduce((sum, row) => sum + row.cash_out_cents, 0),
    excluded_paystack_fees_cents,
    by_date,
  };
}

export async function loadRecordedExpenseCash(admin: SupabaseClient, from: string, to: string) {
  const rows = await fetchAllPayoutRows<CashOutExpenseRow>((a, b) => admin
    .from("expenses")
    .select("id, expense_date, amount_cents, payment_transaction_id, expense_categories ( name ), payment_transactions!expenses_payment_transaction_id_fkey ( gateway )")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("id")
    .range(a, b));
  return summarizeRecordedExpenseCash(rows);
}
