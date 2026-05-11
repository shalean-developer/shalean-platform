import { describe, expect, it } from "vitest";
import { redactOperationalContext } from "@/lib/logging/redactOperationalContext";

describe("redactOperationalContext", () => {
  it("redacts email and authorization-like keys", () => {
    expect(
      redactOperationalContext({
        bookingId: "b1",
        customer_email: "a@b.com",
        paystack_authorization_code: "AUTHSECRET",
      }),
    ).toEqual({
      bookingId: "b1",
      customer_email: "[redacted]",
      paystack_authorization_code: "[redacted]",
    });
  });

  it("redacts nested metadata objects to key lists", () => {
    expect(
      redactOperationalContext({
        reference: "ref_1",
        metadata: { customer_email: "x", foo: "bar" },
      }),
    ).toEqual({
      reference: "ref_1",
      metadata: { _redacted: true, keys: ["customer_email", "foo"] },
    });
  });

  it("phone tail only", () => {
    expect(
      redactOperationalContext({
        customer_phone: "+27821234567",
      }),
    ).toEqual({
      customer_phone: "phone_tail:4567",
    });
  });
});
