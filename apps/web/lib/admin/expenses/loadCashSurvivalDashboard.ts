import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOfficePayoutPeriodReport, normalizeOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { loadSettlementCashSummary } from "@/lib/payments/loadSettlementCashSummary";

export type CashSurvivalStatus = "red" | "amber" | "green" | "unknown";

export type CashSurvivalDashboardPayload = {
  period: { from: string; to: string };
  as_of: string;
  status: CashSurvivalStatus;
  accounts: Array<{
    id: string;
    name: string;
    account_type: string;
    balance_cents: number;
    updated_at: string | null;
    stale: boolean;
  }>;
  data_quality: {
    bank_balance_fresh: boolean;
    bank_balance_last_updated_at: string | null;
    stale_bank_account_count: number;
    note: string | null;
  };
  cash: {
    bank_cents: number;
    petty_cash_cents: number;
    confirmed_liquid_cash_cents: number;
    paystack_settled_cents: number;
    paystack_in_transit_verified_cents: number;
    paystack_pending_unverified_cents: number;
  };
  receivables: {
    sent_collectible_cents: number;
    overdue_cents: number;
    draft_monthly_cents: number;
  };
  obligations: {
    cleaner_earned_cents: number;
    cleaner_paid_cents: number;
    cleaner_unpaid_liability_cents: number;
    recurring_due_cents: number;
    minimum_operating_reserve_cents: number;
    protected_cash_required_cents: number;
  };
  decision: {
    safe_to_spend_cents: number | null;
    cash_after_protected_obligations_cents: number;
    funding_gap_cents: number;
    runway_days: number | null;
  };
};

function cents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function configuredReserveCents(): number {
  const raw = Number(process.env.SHALEAN_MIN_OPERATING_RESERVE_CENTS);
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 500_000;
}

/**
 * Conservative owner cash-control model.
 *
 * Rules:
 * - Bank/petty-cash balances are the only immediately spendable cash.
 * - Paystack pending settlements and draft invoices are shown, but never included in safe-to-spend.
 * - All month-to-date unpaid cleaner earnings are protected, even though payout is monthly.
 * - Active recurring expenses due inside the selected period are protected.
 * - A minimum operating reserve is protected before discretionary spend.
 * - If bank balances are stale, safe-to-spend is deliberately null rather than presenting false precision.
 */
export async function loadCashSurvivalDashboard(
  admin: SupabaseClient,
  fromRaw?: string | null,
  toRaw?: string | null,
  now: Date = new Date(),
): Promise<CashSurvivalDashboardPayload> {
  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw, now);
  const report = await loadOfficePayoutPeriodReport(admin, from, to);
  const settlement = await loadSettlementCashSummary(admin, { from, to, now });

  const [{ data: accounts, error: accountsErr }, { data: invoices, error: invoiceErr }, { data: recurring, error: recurringErr }] =
    await Promise.all([
      admin
        .from("expense_accounts")
        .select("id, name, account_type, balance_cents, updated_at, is_active")
        .eq("is_active", true),
      admin
        .from("monthly_invoices")
        .select("status, balance_cents, total_cents, due_date, period_start, period_end")
        .lte("period_start", to)
        .gte("period_end", from),
      admin
        .from("recurring_expenses")
        .select("amount_cents, next_run_date, status")
        .eq("status", "active")
        .gte("next_run_date", from)
        .lte("next_run_date", to),
    ]);

  const firstErr = accountsErr ?? invoiceErr ?? recurringErr;
  if (firstErr) throw new Error(firstErr.message);

  let bankCents = 0;
  let pettyCashCents = 0;
  let latestBankUpdatedAt: string | null = null;
  let staleBankAccountCount = 0;
  const staleCutoffMs = now.getTime() - 48 * 60 * 60 * 1000;
  const accountRows: CashSurvivalDashboardPayload["accounts"] = [];

  for (const raw of accounts ?? []) {
    const row = raw as {
      id?: string | null;
      name?: string | null;
      account_type?: string | null;
      balance_cents?: number | null;
      updated_at?: string | null;
    };
    const type = String(row.account_type ?? "").toLowerCase();
    const updatedAt = row.updated_at ? String(row.updated_at) : null;
    const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
    const stale = !Number.isFinite(updatedMs) || updatedMs < staleCutoffMs;
    accountRows.push({
      id: String(row.id ?? ""),
      name: String(row.name ?? "Finance account"),
      account_type: type,
      balance_cents: cents(row.balance_cents),
      updated_at: updatedAt,
      stale,
    });

    if (type === "bank") {
      bankCents += cents(row.balance_cents);
      if (updatedAt && (!latestBankUpdatedAt || updatedAt > latestBankUpdatedAt)) latestBankUpdatedAt = updatedAt;
      if (stale) staleBankAccountCount += 1;
    } else if (type === "petty_cash") {
      pettyCashCents += cents(row.balance_cents);
    }
  }

  let sentCollectible = 0;
  let overdue = 0;
  let draftMonthly = 0;
  const todayYmd = now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  for (const raw of invoices ?? []) {
    const row = raw as { status?: string | null; balance_cents?: number | null; total_cents?: number | null; due_date?: string | null };
    const status = String(row.status ?? "").toLowerCase();
    if (status === "draft") {
      draftMonthly += cents(row.total_cents ?? row.balance_cents);
      continue;
    }
    if (["sent", "partially_paid", "overdue"].includes(status)) {
      const balance = cents(row.balance_cents);
      sentCollectible += balance;
      if (status === "overdue" || (row.due_date && String(row.due_date) < todayYmd)) overdue += balance;
    }
  }

  const recurringDue = (recurring ?? []).reduce((sum, row) => sum + cents((row as { amount_cents?: number | null }).amount_cents), 0);
  const cleanerEarned = cents(report.totals.earned_cents);
  const cleanerPaid = cents(report.totals.paid_cents);
  const cleanerUnpaid = Math.max(0, cleanerEarned - cleanerPaid);
  const reserve = configuredReserveCents();
  const confirmedLiquidCash = bankCents + pettyCashCents;
  const protected = cleanerUnpaid + recurringDue + reserve;
  const postProtection = confirmedLiquidCash - protected;
  const fundingGap = Math.max(0, -postProtection);

  const bankBalanceFresh = staleBankAccountCount === 0 && latestBankUpdatedAt != null;
  const safeToSpend = bankBalanceFresh ? Math.max(0, postProtection) : null;

  const periodDays = Math.max(1, Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const paidOutCents = cents(report.totals.paid_cents);
  const avgDailyProtectedOutflow = (paidOutCents + recurringDue) / periodDays;
  const runwayDays = avgDailyProtectedOutflow > 0 ? Math.max(0, Math.floor(confirmedLiquidCash / avgDailyProtectedOutflow)) : null;

  let status: CashSurvivalStatus = "unknown";
  if (bankBalanceFresh) {
    if (fundingGap > 0 || (runwayDays != null && runwayDays < 7)) status = "red";
    else if (runwayDays != null && runwayDays < 14) status = "amber";
    else status = "green";
  }

  return {
    period: { from, to },
    as_of: now.toISOString(),
    status,
    accounts: accountRows.sort((a, b) => a.account_type.localeCompare(b.account_type) || a.name.localeCompare(b.name)),
    data_quality: {
      bank_balance_fresh: bankBalanceFresh,
      bank_balance_last_updated_at: latestBankUpdatedAt,
      stale_bank_account_count: staleBankAccountCount,
      note: bankBalanceFresh ? null : "Bank balance is stale or missing. Refresh the finance account balance before relying on safe-to-spend.",
    },
    cash: {
      bank_cents: bankCents,
      petty_cash_cents: pettyCashCents,
      confirmed_liquid_cash_cents: confirmedLiquidCash,
      paystack_settled_cents: settlement.settled_to_bank_cents,
      paystack_in_transit_verified_cents: settlement.verified_in_transit_cents,
      paystack_pending_unverified_cents: settlement.unverified_pending_cents,
    },
    receivables: {
      sent_collectible_cents: sentCollectible,
      overdue_cents: overdue,
      draft_monthly_cents: draftMonthly,
    },
    obligations: {
      cleaner_earned_cents: cleanerEarned,
      cleaner_paid_cents: cleanerPaid,
      cleaner_unpaid_liability_cents: cleanerUnpaid,
      recurring_due_cents: recurringDue,
      minimum_operating_reserve_cents: reserve,
      protected_cash_required_cents: protected,
    },
    decision: {
      safe_to_spend_cents: safeToSpend,
      cash_after_protected_obligations_cents: postProtection,
      funding_gap_cents: fundingGap,
      runway_days: runwayDays,
    },
  };
}
