import { describe, expect, it } from "vitest";

import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

describe("resolveCustomerOutboundEmail candidate order", () => {
  it("prefers booking customer_email over synthetic walkin login", () => {
    expect(
      pickBillingEmail([
        "customer@gmail.com",
        "27821234567@walkin.shalean.com",
      ]),
    ).toBe("customer@gmail.com");
  });

  it("prefers billing_email over walkin login when passed in order", () => {
    expect(
      pickBillingEmail([
        "billing@company.co.za",
        "27821234567@walkin.shalean.com",
      ]),
    ).toBe("billing@company.co.za");
  });

  it("returns null when only synthetic walkin login is available", () => {
    expect(pickBillingEmail(["27821234567@walkin.shalean.com"])).toBeNull();
  });
});
