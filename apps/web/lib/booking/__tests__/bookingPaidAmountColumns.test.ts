import { describe, expect, it } from "vitest";
import {
  bookingPaidAmountColumnsFromCents,
  bookingPaidAmountColumnsFromZar,
  bookingUncollectedCashColumns,
} from "@/lib/booking/bookingPaidAmountColumns";

describe("bookingPaidAmountColumns", () => {
  it("keeps cents and zar exactly in sync from cents SoT", () => {
    expect(bookingPaidAmountColumnsFromCents(12_550)).toEqual({
      amount_paid_cents: 12_550,
      total_paid_cents: 12_550,
      total_paid_zar: 125.5,
    });
  });

  it("rounds zar input to cents then mirrors the exact settled value", () => {
    expect(bookingPaidAmountColumnsFromZar(99.4)).toEqual({
      amount_paid_cents: 9940,
      total_paid_cents: 9940,
      total_paid_zar: 99.4,
    });
  });

  it("preserves cents instead of rounding the legacy ZAR mirror to whole rands", () => {
    expect(bookingPaidAmountColumnsFromCents(180_250)).toEqual({
      amount_paid_cents: 180_250,
      total_paid_cents: 180_250,
      total_paid_zar: 1802.5,
    });
  });

  it("floors negative / NaN to zero", () => {
    expect(bookingPaidAmountColumnsFromCents(-5).amount_paid_cents).toBe(0);
    expect(bookingPaidAmountColumnsFromZar(Number.NaN).amount_paid_cents).toBe(0);
  });

  it("exposes an explicit uncollected cash patch", () => {
    expect(bookingUncollectedCashColumns()).toEqual({
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
    });
  });
});
