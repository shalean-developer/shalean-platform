import { describe, expect, it } from "vitest";
import { paymentCustomerIdentityMismatch } from "@/lib/booking/paymentCustomerIdentityGuard";

describe("paymentCustomerIdentityMismatch", () => {
  it("accepts matching email and ownership regardless of email case", () => {
    expect(
      paymentCustomerIdentityMismatch(
        { customerEmail: "Customer@Example.com", customerAuthId: "11111111-1111-4111-8111-111111111111" },
        { customerEmail: "customer@example.com", customerAuthId: "11111111-1111-4111-8111-111111111111" },
      ),
    ).toBeNull();
  });

  it("rejects a conflicting customer email", () => {
    expect(
      paymentCustomerIdentityMismatch(
        { customerEmail: "owner@example.com", customerAuthId: null },
        { customerEmail: "other@example.com", customerAuthId: null },
      ),
    ).toBe("email");
  });

  it("rejects a conflicting booking owner", () => {
    expect(
      paymentCustomerIdentityMismatch(
        { customerEmail: "owner@example.com", customerAuthId: "11111111-1111-4111-8111-111111111111" },
        { customerEmail: "owner@example.com", customerAuthId: "22222222-2222-4222-8222-222222222222" },
      ),
    ).toBe("ownership");
  });

  it("allows finalization to fill missing legacy identity", () => {
    expect(
      paymentCustomerIdentityMismatch(
        { customerEmail: null, customerAuthId: null },
        { customerEmail: "owner@example.com", customerAuthId: "11111111-1111-4111-8111-111111111111" },
      ),
    ).toBeNull();
  });

  it("does not erase existing identity when incoming identity is absent", () => {
    expect(
      paymentCustomerIdentityMismatch(
        { customerEmail: "owner@example.com", customerAuthId: "11111111-1111-4111-8111-111111111111" },
        { customerEmail: null, customerAuthId: null },
      ),
    ).toBeNull();
  });
});
