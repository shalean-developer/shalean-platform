import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

type SettledPaymentRow = {
  id: string;
  settlement_date: string;
  net_settlement_cents: number | null;
  amount_cents: number;
};

/**
 * The selected bank-cash period is determined by settlement_date, not by
 * paid_at. A payment received before the period can settle during it.
 *
 * Use this one ledger selection for the summary and the daily cash-flow chart
 * so their Paystack inflows cannot disagree on a cross-period settlement.
 * This is recorded local settlement evidence, not independent bank-feed proof.
 */
export async function loadRecordedSettlementsByDate(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<{ settled_to_bank_cents: number; by_date: Array<{ date: string; cash_in_cents: number }> }> {
  const rows = await fetchAllPayoutRows<SettledPaymentRow>((a, b) => admin
    .from("payment_transactions")
    .select("id, settlement_date, net_settlement_cents, amount_cents")
    .eq("gateway", "paystack")
    .eq("settlement_status", "settled")
    .gte("settlement_date", from)
    .lte("settlement_date", to)
    .order("id")
    .range(a, b));

  const perDay = new Map<string, number>();
  for (const row of rows) {
    // Preserve the existing fallback amount semantics; do not change ledger values.
    const amount = row.net_settlement_cents ?? row.amount_cents ?? 0;
    perDay.set(row.settlement_date, (perDay.get(row.settlement_date) ?? 0) + amount);
  }
  const by_date = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cash_in_cents]) => ({ date, cash_in_cents }));
  return {
    settled_to_bank_cents: by_date.reduce((sum, day) => sum + day.cash_in_cents, 0),
    by_date,
  };
}
