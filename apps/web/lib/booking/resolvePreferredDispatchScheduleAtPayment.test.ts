import { describe, expect, it } from "vitest";
import {
  resolvePaidBookingQuoteFinancialSplitCents,
  resolvePreferredDispatchScheduleAtPayment,
} from "@/lib/booking/upsertBookingFromPaystack";

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


describe("resolvePaidBookingQuoteFinancialSplitCents", () => {
  it("preserves the authoritative pending Booking V2 quote split", () => {
    expect(
      resolvePaidBookingQuoteFinancialSplitCents({
        isRecurringPrepayment: false,
        bookingVisitZar: 977,
        priceSnapshotSubtotalZar: 500,
        totalPaidCents: 97_700,
        persistedBaseAmountCents: 92_700,
        persistedServiceFeeCents: 5_000,
      }),
    ).toEqual({
      baseAmountCents: 92_700,
      serviceFeeCents: 5_000,
    });
  });

  it("falls back to the checkout snapshot only when no persisted quote split exists", () => {
    expect(
      resolvePaidBookingQuoteFinancialSplitCents({
        isRecurringPrepayment: false,
        bookingVisitZar: 577,
        priceSnapshotSubtotalZar: 500,
        totalPaidCents: 57_700,
        persistedBaseAmountCents: null,
        persistedServiceFeeCents: null,
      }),
    ).toEqual({
      baseAmountCents: 50_000,
      serviceFeeCents: 7_700,
    });
  });
});
