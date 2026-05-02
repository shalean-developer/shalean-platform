import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { getJhbIsoWeekStartYmd } from "@/lib/cleaner/earnings/weekBounds";
import type { CleanerEarningsRowWire } from "@/lib/cleaner/earnings/types";

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Sum of cleaner `amount_cents` for rows paid (`payout_paid_at`) in the current ISO week (Mon–Sun, JHB). */
export function paidThisWeekCents(rows: readonly CleanerEarningsRowWire[], now = new Date()): number {
  const todayY = johannesburgCalendarYmd(now);
  const weekStart = getJhbIsoWeekStartYmd(now);
  let sum = 0;
  for (const r of rows) {
    if (String(r.payout_status).toLowerCase() !== "paid" || !r.payout_paid_at?.trim()) continue;
    const paidY = earningsPeriodBucketYmd({ completed_at: r.payout_paid_at, schedule_date: null });
    if (!paidY || paidY < weekStart || paidY > todayY) continue;
    sum += cents(r.amount_cents);
  }
  return sum;
}
