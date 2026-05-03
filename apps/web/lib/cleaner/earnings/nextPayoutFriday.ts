import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { getPreviousWeekDateBoundsUtc } from "@/lib/payout/weekBounds";
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

function formatFridayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  return d.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", month: "short", day: "numeric" });
}

/** End of Thursday 23:59:59.999 SAST immediately before payout Friday `fridayYmd`. */
export function thursdayCutoffEndMsBeforeFriday(fridayYmd: string): number {
  const thu = addDaysYmd(fridayYmd, -1);
  return new Date(`${thu}T23:59:59.999+02:00`).getTime();
}

/**
 * Human copy for “when do I get paid?” — weekly Friday batch in Johannesburg with **Thursday midnight SAST cutoff**
 * for new completions counting toward that Friday’s transfer.
 */
export function payoutArrivalSummaryJohannesburg(now = new Date()): {
  daysUntil: number;
  /** Friday when the next transfer for *new* post-cutoff earnings is expected. */
  nextFridayYmd: string;
  headline: string;
  sub: string;
  /** True once Thursday 23:59 SAST has passed for the batch anchored at `calendarFridayYmd`. */
  cutoffPassedForBatch: boolean;
  /** Hours until Thursday cutoff (0–168); null if cutoff already passed or not applicable. */
  hoursUntilCutoff: number | null;
  /** The Friday for the batch whose Thursday cutoff we’re comparing against (chronological “this week Friday”). */
  calendarFridayYmd: string;
  /** Friday we describe for *new* earnings from `now` onward (may be +7 days after cutoff). */
  payoutTargetFridayYmd: string;
} {
  const calendarFridayYmd = nextFridayYmdJohannesburg(now);
  const cutoffMs = thursdayCutoffEndMsBeforeFriday(calendarFridayYmd);
  const nowMs = now.getTime();
  const todayYmd = johannesburgCalendarYmd(now);
  const cutoffPassedForBatch = nowMs > cutoffMs;
  const isPayoutFridayToday = todayYmd === calendarFridayYmd;

  let payoutTargetFridayYmd = calendarFridayYmd;
  let headline: string;
  let sub: string;
  let hoursUntilCutoff: number | null = null;

  if (!cutoffPassedForBatch) {
    const h = Math.ceil((cutoffMs - nowMs) / 3_600_000);
    hoursUntilCutoff = Math.max(0, Math.min(168, h));
    const friLabel = formatFridayLabel(calendarFridayYmd);
    headline =
      hoursUntilCutoff > 0 && hoursUntilCutoff <= 72
        ? `Arrives this Friday (${friLabel}) — cutoff in ~${hoursUntilCutoff}h`
        : `Arrives this Friday (${friLabel})`;
    sub =
      "Weekly payouts use Johannesburg time. Work finalized before Thursday 23:59 SAST goes into this Friday’s batch. Exact bank credit time can vary.";
  } else if (isPayoutFridayToday) {
    payoutTargetFridayYmd = addDaysYmd(calendarFridayYmd, 7);
    headline = `Payout batch: today (${formatFridayLabel(calendarFridayYmd)})`;
    sub = `Thursday’s cutoff has passed. Amounts already eligible stay on today’s run — new completions move toward next Friday (${formatFridayLabel(payoutTargetFridayYmd)}).`;
  } else {
    payoutTargetFridayYmd = addDaysYmd(calendarFridayYmd, 7);
    headline = `Arrives next Friday (${formatFridayLabel(payoutTargetFridayYmd)}) — cutoff passed`;
    sub =
      "Cutoff for this week’s batch was Thursday midnight (SAST). New earnings count toward the following Friday’s transfer.";
  }

  const daysUntil = Math.max(
    0,
    Math.round(
      (new Date(`${payoutTargetFridayYmd}T12:00:00+02:00`).getTime() - new Date(`${todayYmd}T12:00:00+02:00`).getTime()) /
        86_400_000,
    ),
  );

  return {
    daysUntil,
    nextFridayYmd: payoutTargetFridayYmd,
    headline,
    sub,
    cutoffPassedForBatch,
    hoursUntilCutoff,
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
  /** UTC Mon–Sun completion window the weekly batch job labels (`generateWeeklyPayouts`). */
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
  const { periodStart, periodEnd } = getPreviousWeekDateBoundsUtc(asOf);
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
