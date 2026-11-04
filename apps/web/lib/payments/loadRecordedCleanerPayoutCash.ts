import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPayoutRows } from "@/lib/payout/payoutQueryPagination";

type PaidCleanerPayoutRow = {
  id: string;
  paid_at: string;
  total_amount_cents: number;
};

function johannesburgDate(isoTimestamp: string): string {
  const time = Date.parse(isoTimestamp);
  if (!Number.isFinite(time)) throw new Error("Invalid cleaner payout payment date.");
  return new Date(time + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Cash outflow for cleaner payouts is recorded when the batch is actually paid,
 * not when its underlying bookings were completed or earned.
 *
 * Reads one paid batch once (not individual booking allocations) and supplies the
 * same date-scoped totals to Cash Flow KPI and daily cash-flow chart.
 */
export async function loadRecordedCleanerPayoutCash(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<{ paid_cents: number; by_date: Array<{ date: string; cash_out_cents: number }> }> {
  const fromUtc = new Date(`${from}T00:00:00+02:00`).toISOString();
  const toExclusiveUtc = new Date(Date.parse(`${to}T00:00:00+02:00`) + 86_400_000).toISOString();

  const rows = await fetchAllPayoutRows<PaidCleanerPayoutRow>((a, b) => admin
    .from("cleaner_payouts")
    .select("id, paid_at, total_amount_cents")
    .eq("status", "paid")
    .gte("paid_at", fromUtc)
    .lt("paid_at", toExclusiveUtc)
    .order("id")
    .range(a, b));

  const seen = new Set<string>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) throw new Error("Duplicate or missing cleaner payout id.");
    seen.add(row.id);
    if (!Number.isSafeInteger(row.total_amount_cents) || row.total_amount_cents < 0)
      throw new Error("Invalid paid cleaner payout amount.");
    const date = johannesburgDate(row.paid_at);
    totals.set(date, (totals.get(date) ?? 0) + row.total_amount_cents);
  }
  const by_date = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cash_out_cents]) => ({ date, cash_out_cents }));
  return { paid_cents: by_date.reduce((sum, day) => sum + day.cash_out_cents, 0), by_date };
}
