import { earningsPeriodBucketYmd } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import { getJhbIsoWeekStartYmd } from "@/lib/cleaner/earnings/weekBounds";
import type { CleanerEarningsRowWire } from "@/lib/cleaner/earnings/types";

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Completed-job earnings bucketed in the ISO week *before* the current one (Mon–Sun, JHB). */
export function priorIsoWeekEarnedCents(rows: readonly CleanerEarningsRowWire[], now = new Date()): number {
  const todayY = johannesburgCalendarYmd(now);
  const thisWeekStart = getJhbIsoWeekStartYmd(now);
  const prevWeekEnd = addDaysYmd(thisWeekStart, -1);
  const prevWeekStart = addDaysYmd(prevWeekEnd, -6);
  let sum = 0;
  for (const r of rows) {
    const ymd = earningsPeriodBucketYmd({ completed_at: r.completed_at, schedule_date: r.date });
    if (!ymd || ymd < prevWeekStart || ymd > prevWeekEnd) continue;
    sum += cents(r.amount_cents);
  }
  return sum;
}

export type WeekOverWeekMomentum = {
  /** Percent change this ISO week vs prior ISO week (completed-job earnings). */
  pctVsPriorWeek: number | null;
  /** Short UX line, or null if not enough signal. */
  message: string | null;
  /** Action-oriented line when behind last week (optional). */
  recoveryHint: string | null;
};

export function weekOverWeekMomentum(
  thisWeekCents: number,
  priorWeekCents: number,
): WeekOverWeekMomentum {
  if (priorWeekCents <= 0 && thisWeekCents <= 0) {
    return { pctVsPriorWeek: null, message: null, recoveryHint: null };
  }
  if (priorWeekCents <= 0 && thisWeekCents > 0) {
    return {
      pctVsPriorWeek: null,
      message: "You’re ahead of last week — keep the streak going.",
      recoveryHint: null,
    };
  }
  const pct = Math.round(((thisWeekCents - priorWeekCents) / priorWeekCents) * 100);
  if (pct >= 1) {
    return {
      pctVsPriorWeek: pct,
      message: `You’re earning about ${pct}% more than last week.`,
      recoveryHint: null,
    };
  }
  if (pct <= -1) {
    const up = Math.abs(pct);
    return {
      pctVsPriorWeek: pct,
      message: `Down about ${up}% vs last week.`,
      recoveryHint: "Accept and complete one more job today to push the week back on track.",
    };
  }
  return { pctVsPriorWeek: 0, message: "Roughly flat vs last week — steady pace.", recoveryHint: null };
}
