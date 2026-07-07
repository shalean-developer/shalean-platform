import { johannesburgCalendarMonthDateRangeYmd, johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { getPreviousMonthDateBoundsJhb } from "@/lib/payout/monthBounds";
import { addDaysYmd, isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";

/** ISO weekday Mon=1 … Fri=5 … Sun=7 in Johannesburg civil date. */
export function daysUntilNextFridayJohannesburg(now = new Date()): number {
  const ymd = johannesburgCalendarYmd(now);
  const iso = isoWeekdayFromYmd(ymd);
  if (iso <= 5) return 5 - iso;
  return 5 - iso + 7;
}

export function nextFridayYmdJohannesburg(now = new Date()): string {
  const ymd = johannesburgCalendarYmd(now);
  return addDaysYmd(ymd, daysUntilNextFridayJohannesburg(now));
}

/** End of Thursday 23:59:59.999 SAST immediately before payout Friday `fridayYmd`. */
export function thursdayCutoffEndMsBeforeFriday(fridayYmd: string): number {
  const thu = addDaysYmd(fridayYmd, -1);
  return new Date(`${thu}T23:59:59.999+02:00`).getTime();
}

/**
 * Human copy for “when do I get paid?” — monthly batches in Johannesburg (from July 2026).
 */
export function payoutArrivalSummaryJohannesburg(now = new Date()): {
  daysUntil: number;
  /** @deprecated Weekly field retained for API compatibility. */
  nextFridayYmd: string;
  headline: string;
  sub: string;
  /** @deprecated Weekly field retained for API compatibility. */
  cutoffPassedForBatch: boolean;
  hoursUntilCutoff: number | null;
  /** @deprecated Weekly field retained for API compatibility. */
  calendarFridayYmd: string;
  /** @deprecated Weekly field retained for API compatibility. */
  payoutTargetFridayYmd: string;
} {
  const todayYmd = johannesburgCalendarYmd(now);
  const { startYmd, endYmd } = johannesburgCalendarMonthDateRangeYmd(now);
  const endMs = new Date(`${endYmd}T23:59:59.999+02:00`).getTime();
  const nowMs = now.getTime();
  const daysUntil = Math.max(
    0,
    Math.round((endMs - new Date(`${todayYmd}T12:00:00+02:00`).getTime()) / 86_400_000),
  );
  const monthLabel = new Date(`${startYmd}T12:00:00+02:00`).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    month: "long",
    year: "numeric",
  });
  const headline =
    daysUntil === 0
      ? `Monthly payout period ends today (${monthLabel})`
      : `Monthly payout — ${monthLabel} (${daysUntil} day${daysUntil === 1 ? "" : "s"} left)`;
  const sub =
    "Cleaner payouts are batched monthly (1st to last day of the month, Johannesburg time). Pay runs after the month closes once invoices are settled.";

  const calendarFridayYmd = nextFridayYmdJohannesburg(now);
  const payoutTargetFridayYmd = calendarFridayYmd;

  return {
    daysUntil,
    nextFridayYmd: payoutTargetFridayYmd,
    headline,
    sub,
    cutoffPassedForBatch: nowMs > endMs,
    hoursUntilCutoff: nowMs > endMs ? null : Math.max(0, Math.ceil((endMs - nowMs) / 3_600_000)),
    calendarFridayYmd,
    payoutTargetFridayYmd,
  };
}

const CUTOFF_EDGE_WINDOW_MS = 5 * 60 * 1000;

/**
 * True when `instantMs` is within ±`windowMs` of a weekly **Thursday 23:59:59.999 SAST** payout cutoff
 * (anchored on nearby payout Fridays). Used for observability around batch boundary bugs.
 */
function firstUtcFridayOnOrAfterYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  for (let i = 0; i < 14; i++) {
    if (d.getUTCDay() === 5) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ymd;
}

export type CutoffAssignmentProbe = {
  ui_calendar_friday_ymd: string;
  ui_payout_target_friday_ymd: string;
  cutoff_passed_for_batch: boolean;
  /** Johannesburg calendar month window the monthly batch job labels (`generateWeeklyPayouts`). */
  batch_utc_completion_period_ymd: { start: string; end: string };
  /** First UTC Friday on/after `period_end` — heuristic “batch pay Friday” label. */
  batch_utc_pay_friday_ymd: string;
  /** `batch_utc_pay_friday_ymd` as Johannesburg civil `YYYY-MM-DD`. */
  batch_pay_friday_jhb_ymd: string;
  /**
   * True when UI “next pay Friday” (Johannesburg cutoff model) disagrees with the UTC-week batch heuristic.
   * Does not prove payout rows wrong — only surfaces decision drift for investigation.
   */
  mismatch: boolean;
};

/**
 * Compares cleaner-facing payout Friday copy ({@link payoutArrivalSummaryJohannesburg}) with a **heuristic**
 * pay Friday derived from the same UTC week window used by {@link generateWeeklyPayouts}.
 */
export function computeCutoffAssignmentProbe(asOf: Date = new Date()): CutoffAssignmentProbe {
  const ui = payoutArrivalSummaryJohannesburg(asOf);
  const { periodStart, periodEnd } = getPreviousMonthDateBoundsJhb(asOf);
  const batchUtcPay = firstUtcFridayOnOrAfterYmd(periodEnd);
  const batchPayJhb = johannesburgCalendarYmd(new Date(`${batchUtcPay}T12:00:00.000Z`));
  const mismatch = batchPayJhb !== ui.payoutTargetFridayYmd;
  return {
    ui_calendar_friday_ymd: ui.calendarFridayYmd,
    ui_payout_target_friday_ymd: ui.payoutTargetFridayYmd,
    cutoff_passed_for_batch: ui.cutoffPassedForBatch,
    batch_utc_completion_period_ymd: { start: periodStart, end: periodEnd },
    batch_utc_pay_friday_ymd: batchUtcPay,
    batch_pay_friday_jhb_ymd: batchPayJhb,
    mismatch,
  };
}

export function instantNearJhbThursdayPayoutCutoff(
  instantMs: number,
  windowMs: number = CUTOFF_EDGE_WINDOW_MS,
): boolean {
  if (!Number.isFinite(instantMs)) return false;
  const refFriday = payoutArrivalSummaryJohannesburg(new Date(instantMs)).calendarFridayYmd;
  for (const off of [-14, -7, 0, 7, 14]) {
    const fri = addDaysYmd(refFriday, off);
    const cut = thursdayCutoffEndMsBeforeFriday(fri);
    if (Math.abs(instantMs - cut) <= windowMs) return true;
  }
  return false;
}
