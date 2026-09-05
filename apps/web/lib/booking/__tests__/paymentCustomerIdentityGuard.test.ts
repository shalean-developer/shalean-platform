import { describe, expect, it } from "vitest";
import { preservePaymentCustomerIdentity, paymentFinalizationReplayEquivalent } from "@/lib/booking/paymentCustomerIdentityGuard";

describe("payment customer identity", () => {
  const observed = { customerEmail: " Person@Example.com ", customerAuthId: "OWNER-A" };
  it.each([
    [" Person@Example.com ", "OWNER-A"],
    ["person@example.com", " owner-a "],
  ])("allows matching normalized identity %s", (customerEmail, customerAuthId) => {
    expect(preservePaymentCustomerIdentity(observed, { customerEmail, customerAuthId }).error).toBeNull();
  });
  it.each([
    ["other@example.com", "OWNER-A"],
    ["person@example.com", "OWNER-B"],
  ])("rejects conflicting identity %s", (customerEmail, customerAuthId) => {
    expect(preservePaymentCustomerIdentity(observed, { customerEmail, customerAuthId }).error?.code)
      .toBe("PAYMENT_CUSTOMER_IDENTITY_MISMATCH");
  });
  it.each([null, "", "   "])("preserves established identity when incoming values are %s", (missing) => {
    expect(preservePaymentCustomerIdentity(observed, { customerEmail: missing, customerAuthId: missing }))
      .toEqual({ error: null, identity: observed });
  });
  it.each(["customerEmail", "customerAuthId"] as const)("fills missing legacy %s", (field) => {
    const existing = { ...observed, [field]: null };
    expect(preservePaymentCustomerIdentity(existing, observed)).toEqual({ error: null, identity: observed });
  });
});

describe("finalized replay equivalence", () => {
  const stored = { id: "booking-a", paystackReference: "pay_current", customerEmail: " Current@Example.com ", customerAuthId: "OWNER-A" };
  const incoming = { bookingIds: ["booking-a"], paystackReference: "pay_current", customerEmail: "current@example.com", customerAuthId: "owner-a" };
  it("accepts normalized identity and trimmed exact reference", () => {
    expect(paymentFinalizationReplayEquivalent(stored, { ...incoming, paystackReference: " pay_current " })).toBe(true);
  });
  it.each([
    { paystackReference: "pay_old" }, { paystackReference: "PAY_CURRENT" }, { paystackReference: null },
    { customerEmail: "old@example.com" }, { customerEmail: "" },
    { customerAuthId: "owner-b" }, { customerAuthId: null }, { bookingIds: ["booking-b"] },
  ])("rejects mismatched or missing proof %j", (change) => {
    expect(paymentFinalizationReplayEquivalent(stored, { ...incoming, ...change })).toBe(false);
  });
  it("allows absent legacy identity without filling it", () => {
    const legacy = { ...stored, customerEmail: null, customerAuthId: null };
    expect(paymentFinalizationReplayEquivalent(legacy, incoming)).toBe(true);
    expect(legacy.customerEmail).toBeNull();
    expect(legacy.customerAuthId).toBeNull();
  });
  it("does not invent a missing persisted reference", () => {
    expect(paymentFinalizationReplayEquivalent({ ...stored, paystackReference: null }, incoming)).toBe(false);
  });
});
