import { describe, expect, it } from "vitest";

import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

describe("monthly invoice customer email candidates", () => {
  it("prefers booking customer_email over walkin auth login", () => {
    expect(
      pickBillingEmail(["jane@company.co.za", "27821234567@walkin.shalean.com"]),
    ).toBe("jane@company.co.za");
  });

  it("uses profile billing email when booking email is synthetic", () => {
    expect(
      pickBillingEmail([
        "27821234567@walkin.shalean.com",
        "billing@company.co.za",
      ]),
    ).toBe("billing@company.co.za");
  });
});
