import { describe, expect, it } from "vitest";
import {
  bookingPaidAmountColumnsFromCents,
  bookingPaidAmountColumnsFromZar,
} from "@/lib/booking/bookingPaidAmountColumns";

describe("bookingPaidAmountColumns", () => {
  it("keeps cents and zar in sync from cents SoT", () => {
    expect(bookingPaidAmountColumnsFromCents(12_550)).toEqual({
      amount_paid_cents: 12_550,
      total_paid_cents: 12_550,
      total_paid_zar: 126,
    });
  });

  it("rounds zar input to cents then mirrors", () => {
    expect(bookingPaidAmountColumnsFromZar(99.4)).toEqual({
      amount_paid_cents: 9940,
      total_paid_cents: 9940,
      total_paid_zar: 99,
    });
  });

  it("floors negative / NaN to zero", () => {
    expect(bookingPaidAmountColumnsFromCents(-5).amount_paid_cents).toBe(0);
    expect(bookingPaidAmountColumnsFromZar(Number.NaN).amount_paid_cents).toBe(0);
  });
});
