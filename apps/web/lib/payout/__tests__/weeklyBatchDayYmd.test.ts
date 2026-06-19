import { describe, expect, it } from "vitest";
import { bookingUsesVisitDateForWeeklyBatch, weeklyBatchDayYmd } from "@/lib/payout/weekBounds";

describe("weeklyBatchDayYmd", () => {
  it("uses visit date for monthly invoice rows even when completed_at is later", () => {
    const row = {
      date: "2026-05-04",
      completed_at: "2026-06-18T10:00:00.000Z",
      payment_status: "success",
      monthly_invoice_id: "inv-1",
    };
    expect(weeklyBatchDayYmd(row)).toBe("2026-05-04");
    expect(bookingUsesVisitDateForWeeklyBatch(row)).toBe(true);
  });

  it("uses visit date for prepaid rows when completion is in a later week (backfill)", () => {
    const row = {
      date: "2026-05-18",
      completed_at: "2026-06-18T10:00:00.000Z",
      payment_status: "success",
      billing_type: "prepaid",
    };
    expect(weeklyBatchDayYmd(row)).toBe("2026-05-18");
    expect(bookingUsesVisitDateForWeeklyBatch(row)).toBe(false);
  });

  it("uses completed_at for prepaid checkout rows completed same week as visit", () => {
    const row = {
      date: "2026-05-04",
      completed_at: "2026-05-05T10:00:00.000Z",
      payment_status: "success",
      billing_type: "prepaid",
    };
    expect(weeklyBatchDayYmd(row)).toBe("2026-05-05");
    expect(bookingUsesVisitDateForWeeklyBatch(row)).toBe(false);
  });
});
