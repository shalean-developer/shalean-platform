import { describe, expect, it } from "vitest";

import { pickMonthlyInvoiceCustomerEmail } from "@/lib/monthlyInvoice/resolveMonthlyInvoiceCustomerEmail";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

describe("pickMonthlyInvoiceCustomerEmail", () => {
  it("prefers admin profile billing email over booking customer_email", () => {
    expect(
      pickMonthlyInvoiceCustomerEmail({
        profileBillingEmail: "billing@company.co.za",
        bookingCustomerEmail: "old@company.co.za",
        loginEmail: "27821234567@walkin.shalean.com",
      }),
    ).toBe("billing@company.co.za");
  });

  it("uses booking customer_email when profile billing email is unset", () => {
    expect(
      pickMonthlyInvoiceCustomerEmail({
        profileBillingEmail: null,
        bookingCustomerEmail: "jane@company.co.za",
        loginEmail: "27821234567@walkin.shalean.com",
      }),
    ).toBe("jane@company.co.za");
  });

  it("uses profile billing email when booking email is synthetic walkin login", () => {
    expect(
      pickBillingEmail([
        "27821234567@walkin.shalean.com",
        "billing@company.co.za",
      ]),
    ).toBe("billing@company.co.za");
    expect(
      pickMonthlyInvoiceCustomerEmail({
        profileBillingEmail: "billing@company.co.za",
        bookingCustomerEmail: "27821234567@walkin.shalean.com",
        loginEmail: "27821234567@walkin.shalean.com",
      }),
    ).toBe("billing@company.co.za");
  });
});
