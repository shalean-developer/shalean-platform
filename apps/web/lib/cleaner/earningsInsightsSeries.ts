import { earningsPeriodBucketYmd, type EarningsPeriodRowInput } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd, parseYmdSast } from "@/lib/recurring/johannesburgCalendar";

function rowAmountCentsForInsights(row: CleanerPayoutSummaryRow): number {
  const st = row.payout_status;
  if (st === "eligible" || st === "paid" || st === "invalid") {
    if (typeof row.payout_frozen_cents === "number" && row.payout_frozen_cents > 0) return row.payout_frozen_cents;
  }
  return row.amount_cents;
}

export type EarningsDayPoint = {
  ymd: string;
  /** Short weekday in Johannesburg. */
  label: string;
  cents: number;
};

/** Last 7 Johannesburg calendar days (oldest → newest), summed by completion bucket per row. */
export function buildLast7DaysEarningsPoints(rows: CleanerPayoutSummaryRow[], now = new Date()): EarningsDayPoint[] {
  const todayY = johannesburgCalendarYmd(now);
  const byDay = new Map<string, number>();

  for (let i = 6; i >= 0; i--) {
    byDay.set(addDaysYmd(todayY, -i), 0);
  }

  for (const row of rows) {
    const cents = rowAmountCentsForInsights(row);
    if (cents <= 0) continue;
    const input: EarningsPeriodRowInput = {
      completed_at: row.completed_at ?? null,
      schedule_date: row.date,
      amount_cents: cents,
    };
    const ymd = earningsPeriodBucketYmd(input);
    if (!ymd || !byDay.has(ymd)) continue;
    byDay.set(ymd, (byDay.get(ymd) ?? 0) + cents);
  }

  const out: EarningsDayPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const ymd = addDaysYmd(todayY, -i);
    const d = parseYmdSast(ymd);
    const label = d.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short" });
    out.push({ ymd, label, cents: byDay.get(ymd) ?? 0 });
  }
  return out;
}

export function buildEarningsInsightMessages(params: {
  summary: {
    pending_cents: number;
    eligible_cents: number;
    paid_cents: number;
    frozen_batch_cents?: number;
    week_cents?: number;
    month_cents?: number;
  };
  points: EarningsDayPoint[];
  pendingJobRows: number;
  hasFailedTransfer: boolean;
  missingBankDetails: boolean;
}): string[] {
  const { summary, points, pendingJobRows, hasFailedTransfer, missingBankDetails } = params;
  const msgs: string[] = [];
  const queued = (summary.frozen_batch_cents ?? 0) + summary.eligible_cents;

  if (hasFailedTransfer) {
    msgs.push("A payout to your bank failed—double-check your account details.");
  }
  if (missingBankDetails && queued > 0) {
    msgs.push("Add bank details so we can send your next transfer.");
  }
  if (pendingJobRows >= 3) {
    msgs.push(`${pendingJobRows} completed jobs are still moving through the payout pipeline.`);
  } else if (summary.pending_cents > summary.eligible_cents && summary.pending_cents > 0) {
    msgs.push("Some recent earnings are still being finalised for payout.");
  }
  if (queued > 0) {
    msgs.push("You have money scheduled for the next weekly payout batch.");
  }
  if (points.length >= 2) {
    const oldest = points[0]?.cents ?? 0;
    const newest = points[points.length - 1]?.cents ?? 0;
    if (newest > oldest && newest > 0) {
      msgs.push("Recent days show more completed-job earnings than a week ago.");
    }
  }
  const week = summary.week_cents ?? 0;
  const month = summary.month_cents ?? 0;
  if (month > 0 && week > 0 && week / month >= 0.35) {
    msgs.push("A strong part of this month’s total landed in the past week.");
  }
  if (msgs.length === 0 && summary.paid_cents > 0) {
    msgs.push("Paid earnings are stacking up—keep the momentum going.");
  }
  return Array.from(new Set(msgs)).slice(0, 5);
}
