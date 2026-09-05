import { describe, expect, it } from "vitest";
import { preservePaymentCustomerIdentity } from "@/lib/booking/paymentCustomerIdentityGuard";

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
