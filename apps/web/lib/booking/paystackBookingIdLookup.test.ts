import { describe, expect, it } from "vitest";
import {
  assertDecoupledPaystackMetadataAllowsFinalize,
  isInlineDecoupledPaystackReference,
  PaystackDecoupledMetadataError,
  resolveInternalBookingIdFromPaystackReference,
} from "@/lib/booking/paystackBookingIdLookup";

describe("resolveInternalBookingIdFromPaystackReference", () => {
  const bookingUuid = "11111111-1111-4111-8111-111111111111";

  it("prefers booking_id from metadata when Paystack reference is pay_<uuid>", () => {
    expect(
      resolveInternalBookingIdFromPaystackReference(`pay_${crypto.randomUUID()}`, {
        booking_id: bookingUuid,
      }),
    ).toBe(bookingUuid);
  });

  it("falls back to shalean_booking_id then bookingId", () => {
    expect(
      resolveInternalBookingIdFromPaystackReference("pay_x", {
        shalean_booking_id: bookingUuid,
      }),
    ).toBe(bookingUuid);
    expect(
      resolveInternalBookingIdFromPaystackReference("pay_x", {
        bookingId: bookingUuid,
      }),
    ).toBe(bookingUuid);
  });

  it("legacy: reference is booking UUID when metadata omits ids", () => {
    expect(resolveInternalBookingIdFromPaystackReference(bookingUuid, {})).toBe(bookingUuid);
  });

  it("returns null for opaque reference without metadata", () => {
    expect(resolveInternalBookingIdFromPaystackReference("pay_no_meta", {})).toBeNull();
  });
});

describe("isInlineDecoupledPaystackReference", () => {
  it("detects pay_ prefix", () => {
    expect(isInlineDecoupledPaystackReference("pay_abc")).toBe(true);
    expect(isInlineDecoupledPaystackReference("PAY_xyz")).toBe(true);
    expect(isInlineDecoupledPaystackReference("11111111-1111-4111-8111-111111111111")).toBe(false);
  });
});

describe("assertDecoupledPaystackMetadataAllowsFinalize", () => {
  const bid = "11111111-1111-4111-8111-111111111111";

  it("allows legacy UUID reference without metadata", () => {
    expect(() => assertDecoupledPaystackMetadataAllowsFinalize(bid, {})).not.toThrow();
  });

  it("allows pay_ reference when booking id is in metadata", () => {
    expect(() =>
      assertDecoupledPaystackMetadataAllowsFinalize(`pay_${crypto.randomUUID()}`, {
        booking_id: bid,
      }),
    ).not.toThrow();
  });

  it("throws PaystackDecoupledMetadataError when pay_ has no resolvable booking", () => {
    expect(() => assertDecoupledPaystackMetadataAllowsFinalize("pay_no_meta", {})).toThrow(
      PaystackDecoupledMetadataError,
    );
  });
});
