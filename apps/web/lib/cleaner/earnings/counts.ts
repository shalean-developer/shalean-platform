import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import type { CleanerEarningsRowWire } from "@/lib/cleaner/earnings/types";

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function countJobsAndCentsForToday(
  rows: readonly CleanerEarningsRowWire[],
  todayY: string,
): { jobs: number; cents: number } {
  let jobs = 0;
  let total = 0;
  for (const r of rows) {
    const ymd = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (!ymd || ymd !== todayY) continue;
    const c = cents(r.amount_cents);
    if (c <= 0) continue;
    jobs += 1;
    total += c;
  }
  return { jobs, cents: total };
}

export function countJobsInWeek(rows: readonly CleanerEarningsRowWire[], todayY: string, weekStart: string): number {
  let n = 0;
  for (const r of rows) {
    const ymd = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (!ymd || ymd < weekStart || ymd > todayY) continue;
    if (cents(r.amount_cents) > 0) n += 1;
  }
  return n;
}
