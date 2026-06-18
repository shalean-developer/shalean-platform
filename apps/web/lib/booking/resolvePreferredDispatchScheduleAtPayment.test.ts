import { describe, expect, it } from "vitest";
import { resolvePreferredDispatchScheduleAtPayment } from "@/lib/booking/upsertBookingFromPaystack";

describe("resolvePreferredDispatchScheduleAtPayment", () => {
  it("uses finalize row date/time when Paystack finalize only returns id", () => {
    expect(
      resolvePreferredDispatchScheduleAtPayment({
        finalizeRow: { date: "2026-06-19", time: "09:00:00" },
        pendingRow: { date: "2026-06-19", time: "09:00" },
        lockedRow: null,
        bookingSnapshot: { date: "2026-06-19", time: "09:00" },
      }),
    ).toEqual({ dateYmd: "2026-06-19", timeHm: "09:00" });
  });

  it("falls back to pending row when finalize patch omitted schedule (legacy bug path)", () => {
    expect(
      resolvePreferredDispatchScheduleAtPayment({
        finalizeRow: { date: null, time: null },
        pendingRow: { date: "2026-06-19", time: "09:00" },
        lockedRow: null,
        bookingSnapshot: null,
      }),
    ).toEqual({ dateYmd: "2026-06-19", timeHm: "09:00" });
  });

  it("falls back to booking_snapshot for V2 checkout metadata", () => {
    expect(
      resolvePreferredDispatchScheduleAtPayment({
        finalizeRow: {},
        pendingRow: null,
        lockedRow: null,
        bookingSnapshot: { date: "2026-06-25", time: "14:30" },
      }),
    ).toEqual({ dateYmd: "2026-06-25", timeHm: "14:30" });
  });
});
