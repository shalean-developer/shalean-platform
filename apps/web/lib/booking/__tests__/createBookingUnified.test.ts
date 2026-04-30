import { describe, expect, it } from "vitest";
import { assertBookingScope } from "@/lib/booking/createBookingUnified";

describe("assertBookingScope", () => {
  it("accepts 1–20 rooms and bathrooms", () => {
    expect(() => assertBookingScope(1, 1)).not.toThrow();
    expect(() => assertBookingScope(20, 20)).not.toThrow();
  });

  it("rejects out-of-range or non-finite", () => {
    expect(() => assertBookingScope(0, 1)).toThrow(/between 1 and 20/);
    expect(() => assertBookingScope(1, 21)).toThrow(/between 1 and 20/);
    expect(() => assertBookingScope(Number.NaN, 1)).toThrow(/finite/);
  });
});
