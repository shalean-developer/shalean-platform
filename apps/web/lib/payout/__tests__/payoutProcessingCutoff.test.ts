import { describe, expect, it } from "vitest";
import { currentPayoutBatchDayYmd, isCurrentPayoutVisitDate, isProcessableClosedPayoutPeriod } from "@/lib/payout/payoutProcessingCutoff";
import { isMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";

describe("October processing policy, independent of historical monthly model", () => {
  it("keeps a late-completed October visit in October", () => {
    const booking = { date: "2026-10-31", completed_at: "2026-11-01T12:00:00Z" };
    expect(currentPayoutBatchDayYmd(booking)).toBe("2026-10-31");
  });
  it.each([null, undefined, "", "2026-09-30", "2026-10-00", "2026-10-32", "2026-13-01", "2026-10-1", "2026-10-01T12:00:00Z"])("rejects deferred or unverifiable visit date %s", value => {
    expect(isCurrentPayoutVisitDate(value)).toBe(false);
  });
  it.each(["2026-10-01", "2026-10-31", "2026-11-01"])("accepts forward visit date %s", value => {
    expect(isCurrentPayoutVisitDate(value)).toBe(true);
  });
  it("preserves July monthly classification while refusing September processing", () => {
    expect(isMonthlyPayoutBatchPeriod("2026-07-01", "2026-07-31")).toBe(true);
    expect(isProcessableClosedPayoutPeriod("2026-09-01", "2026-09-30", new Date("2026-11-01T00:00:00+02:00"))).toBe(false);
  });
  it("opens October exactly at Johannesburg month close", () => {
    expect(isProcessableClosedPayoutPeriod("2026-10-01", "2026-10-31", new Date("2026-10-31T23:59:59+02:00"))).toBe(false);
    expect(isProcessableClosedPayoutPeriod("2026-10-01", "2026-10-31", new Date("2026-11-01T00:00:00+02:00"))).toBe(true);
  });
  it("rejects an incomplete or invalid monthly range", () => {
    expect(isProcessableClosedPayoutPeriod("2026-10-02", "2026-10-31", new Date("2026-11-01T00:00:00+02:00"))).toBe(false);
    expect(isProcessableClosedPayoutPeriod("2026-10-01", "2026-10-30", new Date("2026-11-01T00:00:00+02:00"))).toBe(false);
  });
});
