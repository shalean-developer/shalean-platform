import { describe, expect, it } from "vitest";
import { countJobsAndCentsForToday } from "@/lib/cleaner/earnings/counts";
import { priorIsoWeekEarnedCents, weekOverWeekMomentum } from "@/lib/cleaner/earnings/momentum";
import {
  computeCutoffAssignmentProbe,
  daysUntilNextFridayJohannesburg,
  nextFridayYmdJohannesburg,
  payoutArrivalSummaryJohannesburg,
} from "@/lib/cleaner/earnings/nextPayoutFriday";
import { paidThisWeekCents } from "@/lib/cleaner/earnings/paidThisWeek";
import type { CleanerEarningsRowWire } from "@/lib/cleaner/earnings/types";
import { getJhbIsoWeekStartYmd, getJhbWeekBounds } from "@/lib/cleaner/earnings/weekBounds";

describe("nextPayoutFriday", () => {
  it("returns Friday ymd after a known Thursday in JHB", () => {
    const thu = new Date("2026-05-07T12:00:00+02:00");
    expect(daysUntilNextFridayJohannesburg(thu)).toBe(1);
    expect(nextFridayYmdJohannesburg(thu)).toBe("2026-05-08");
  });

  it("payout summary before Thursday cutoff targets this Friday", () => {
    const wed = new Date("2026-05-06T12:00:00+02:00");
    const s = payoutArrivalSummaryJohannesburg(wed);
    expect(s.cutoffPassedForBatch).toBe(false);
    expect(s.payoutTargetFridayYmd).toBe("2026-05-08");
    expect(s.headline.toLowerCase()).toContain("this friday");
  });

  it("payout summary on payout Friday after cutoff describes today’s batch and next target", () => {
    const friMorning = new Date("2026-05-08T10:00:00+02:00");
    const s = payoutArrivalSummaryJohannesburg(friMorning);
    expect(s.cutoffPassedForBatch).toBe(true);
    expect(s.payoutTargetFridayYmd).toBe("2026-05-15");
    expect(s.headline.toLowerCase()).toContain("today");
  });

  it("computeCutoffAssignmentProbe returns UI + batch window fields", () => {
    const wed = new Date("2026-05-06T12:00:00+02:00");
    const p = computeCutoffAssignmentProbe(wed);
    expect(p.ui_payout_target_friday_ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.batch_utc_completion_period_ymd.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.batch_pay_friday_jhb_ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof p.mismatch).toBe("boolean");
  });
});

describe("paidThisWeekCents", () => {
  it("sums paid rows whose payout_paid_at falls in current ISO week", () => {
    const now = new Date("2026-05-07T12:00:00+02:00"); // Thu
    const rows: CleanerEarningsRowWire[] = [
      {
        booking_id: "a",
        date: "2026-05-06",
        completed_at: "2026-05-06T10:00:00+02:00",
        service: "x",
        location: "y",
        payout_status: "paid",
        payout_frozen_cents: null,
        amount_cents: 100,
        payout_paid_at: "2026-05-06T15:00:00+02:00",
        payout_run_id: "r",
      },
      {
        booking_id: "b",
        date: "2026-04-20",
        completed_at: "2026-04-20T10:00:00+02:00",
        service: "x",
        location: "y",
        payout_status: "paid",
        payout_frozen_cents: null,
        amount_cents: 50,
        payout_paid_at: "2026-04-21T15:00:00+02:00",
        payout_run_id: "r",
      },
    ];
    expect(paidThisWeekCents(rows, now)).toBe(100);
  });
});

describe("priorIsoWeekEarnedCents", () => {
  it("sums completions in the previous ISO week only", () => {
    const now = new Date("2026-05-07T12:00:00+02:00");
    const rows: CleanerEarningsRowWire[] = [
      {
        booking_id: "w",
        date: "2026-04-28",
        completed_at: "2026-04-28T12:00:00+02:00",
        service: "x",
        location: "y",
        payout_status: "eligible",
        payout_frozen_cents: null,
        amount_cents: 200,
        payout_paid_at: null,
        payout_run_id: null,
      },
      {
        booking_id: "c",
        date: "2026-05-06",
        completed_at: "2026-05-06T12:00:00+02:00",
        service: "x",
        location: "y",
        payout_status: "eligible",
        payout_frozen_cents: null,
        amount_cents: 300,
        payout_paid_at: null,
        payout_run_id: null,
      },
    ];
    expect(priorIsoWeekEarnedCents(rows, now)).toBe(200);
  });
});

describe("weekOverWeekMomentum", () => {
  it("returns up message when prior week had earnings and this week is higher", () => {
    const m = weekOverWeekMomentum(120, 100);
    expect(m.pctVsPriorWeek).toBe(20);
    expect(m.message).toContain("20%");
    expect(m.recoveryHint).toBeNull();
  });

  it("returns recovery hint when down vs last week", () => {
    const m = weekOverWeekMomentum(80, 100);
    expect(m.pctVsPriorWeek).toBe(-20);
    expect(m.recoveryHint).toContain("Accept");
  });
});

describe("getJhbWeekBounds", () => {
  it("returns Monday–Sunday YMD for the ISO week containing a known Thursday", () => {
    const thu = new Date("2026-05-07T12:00:00+02:00");
    expect(getJhbIsoWeekStartYmd(thu)).toBe("2026-05-04");
    const b = getJhbWeekBounds(thu);
    expect(b.startYmd).toBe("2026-05-04");
    expect(b.endYmd).toBe("2026-05-10");
  });
});

describe("countJobsAndCentsForToday", () => {
  it("counts rows whose completion bucket is today JHB", () => {
    const todayY = "2026-05-07";
    const rows: CleanerEarningsRowWire[] = [
      {
        booking_id: "1",
        date: "2026-05-07",
        completed_at: "2026-05-07T09:00:00+02:00",
        service: "s",
        location: "l",
        payout_status: "pending",
        payout_frozen_cents: null,
        amount_cents: 50,
        payout_paid_at: null,
        payout_run_id: null,
      },
    ];
    expect(countJobsAndCentsForToday(rows, todayY)).toEqual({ jobs: 1, cents: 50 });
  });
});
