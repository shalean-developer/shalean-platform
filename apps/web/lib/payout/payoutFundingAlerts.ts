import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyFinanceUsers } from "@/lib/admin/expenses/financeNotifications";
import { loadCashSurvivalDashboard } from "@/lib/admin/expenses/loadCashSurvivalDashboard";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";

export type PayoutFundingAlertResult = {
  checked: boolean;
  sent: boolean;
  days_before_payout: number | null;
  payout_date: string;
  funding_gap_cents: number | null;
  reason?: string;
};

function johannesburgYmd(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function configuredPayoutDay(): number {
  const raw = Number(process.env.SHALEAN_MONTHLY_PAYOUT_DAY);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 28) return Math.floor(raw);
  return 5;
}

function payoutDateAfterPeriod(periodEnd: string): string {
  const d = new Date(`${periodEnd}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, configuredPayoutDay());
  return d.toISOString().slice(0, 10);
}

function diffDays(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T12:00:00Z`);
  const to = Date.parse(`${toYmd}T12:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Sends one finance warning at 14, 7 or 3 days before the configured monthly
 * cleaner payout date when protected obligations exceed confirmed liquid cash.
 */
export async function runPayoutFundingGapAlert(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<PayoutFundingAlertResult> {
  const period = defaultOfficePayoutPeriodRange(now);
  const payoutDate = payoutDateAfterPeriod(period.to);
  const today = johannesburgYmd(now);
  const days = diffDays(today, payoutDate);
  const threshold = [14, 7, 3].includes(days) ? days : null;

  if (threshold == null) {
    return { checked: false, sent: false, days_before_payout: days, payout_date: payoutDate, funding_gap_cents: null, reason: "not_alert_day" };
  }

  const survival = await loadCashSurvivalDashboard(admin, period.from, period.to, now);
  if (!survival.data_quality.bank_balance_fresh) {
    return {
      checked: true,
      sent: false,
      days_before_payout: days,
      payout_date: payoutDate,
      funding_gap_cents: null,
      reason: "bank_balance_stale",
    };
  }

  const gap = survival.decision.funding_gap_cents;
  if (gap <= 0) {
    return { checked: true, sent: false, days_before_payout: days, payout_date: payoutDate, funding_gap_cents: 0, reason: "fully_funded" };
  }

  const type = `payout_funding_gap_${period.from}_${threshold}`;
  const { data: existing } = await admin
    .from("finance_notifications")
    .select("id")
    .eq("type", type)
    .limit(1);

  if (existing?.length) {
    return { checked: true, sent: false, days_before_payout: days, payout_date: payoutDate, funding_gap_cents: gap, reason: "already_sent" };
  }

  await notifyFinanceUsers(admin, {
    type,
    title: `Cleaner payout funding gap — ${threshold} days remaining`,
    body: `The current monthly cleaner payout cycle has a protected-cash funding gap of R ${(gap / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Collect receivables or add approved working capital before ${payoutDate}.`,
    link: "/office/cash-flow",
    entityType: "cleaner_payout_cycle",
  });

  return { checked: true, sent: true, days_before_payout: days, payout_date: payoutDate, funding_gap_cents: gap };
}
