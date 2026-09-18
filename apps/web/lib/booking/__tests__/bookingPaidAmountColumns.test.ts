import { describe, expect, it } from "vitest";
import {
  bookingPaidAmountColumnsFromCents,
  bookingPaidAmountColumnsFromZar,
  bookingUncollectedCashColumns,
} from "@/lib/booking/bookingPaidAmountColumns";

const validAmounts = [
  [125.50, 12_550, 126],
  [99.40, 9_940, 99],
  [1802.50, 180_250, 1803],
  [100, 10_000, 100],
  [0, 0, 0],
  [0.29, 29, 0],
  [21_474_836.47, 2_147_483_647, 21_474_836],
];

describe("bookingPaidAmountColumns", () => {
  it.each(validAmounts)("preserves exact cents for R%s with an integer-only legacy mirror", (_zar, cents, mirror) => {
    expect(bookingPaidAmountColumnsFromCents(cents)).toEqual({
      amount_paid_cents: cents,
      total_paid_cents: cents,
      total_paid_zar: mirror,
    });
    expect(Number.isInteger(bookingPaidAmountColumnsFromCents(cents).total_paid_zar)).toBe(true);
  });

  it.each(validAmounts)("converts R%s to exact cents and the compatibility mirror", (zar, cents, mirror) => {
    expect(bookingPaidAmountColumnsFromZar(zar)).toEqual({
      amount_paid_cents: cents,
      total_paid_cents: cents,
      total_paid_zar: mirror,
    });
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER, "12550", "", null, undefined, false])(
    "rejects invalid cents %s instead of inventing zero cash",
    (input) => {
      expect(() => bookingPaidAmountColumnsFromCents(input)).toThrow("Invalid collected-cash cents");
    },
  );

  it.each([-1, NaN, Infinity, -Infinity, 21_474_836.48, Number.MAX_VALUE, "99.40", "", null, undefined])(
    "rejects invalid ZAR %s",
    (input) => {
      expect(() => bookingPaidAmountColumnsFromZar(input as number)).toThrow("Invalid collected-cash ZAR");
    },
  );

  it("retains the settled ZAR helper's nearest-cent conversion", () => {
    expect(bookingPaidAmountColumnsFromZar(1.234).amount_paid_cents).toBe(123);
    expect(bookingPaidAmountColumnsFromZar(1.236).amount_paid_cents).toBe(124);
  });

  it("exposes an explicit uncollected cash patch", () => {
    expect(bookingUncollectedCashColumns()).toEqual({
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
    });
  });
});
