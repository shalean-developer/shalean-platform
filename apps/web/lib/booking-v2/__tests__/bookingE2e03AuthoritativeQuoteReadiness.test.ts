import { describe, expect, it } from "vitest";
import { authoritativeQuoteAllowsPaymentEntry } from "@/lib/booking-v2/bookingQuoteReadiness";

describe("BOOKING-E2E-03 authoritative quote payment-entry gate", () => {
  it("blocks while the latest server quote is loading", () => {
    expect(authoritativeQuoteAllowsPaymentEntry({ requestState: "loading", hasPendingBooking: false })).toBe(false);
  });

  it("blocks when the latest server quote failed", () => {
    expect(authoritativeQuoteAllowsPaymentEntry({ requestState: "error", hasPendingBooking: false })).toBe(false);
  });

  it("allows payment only after the latest authoritative quote succeeds", () => {
    expect(authoritativeQuoteAllowsPaymentEntry({ requestState: "ready", hasPendingBooking: false })).toBe(true);
  });

  it("allows recovery of an already-persisted pending booking without repricing the draft", () => {
    expect(authoritativeQuoteAllowsPaymentEntry({ requestState: "error", hasPendingBooking: true })).toBe(true);
  });
});
