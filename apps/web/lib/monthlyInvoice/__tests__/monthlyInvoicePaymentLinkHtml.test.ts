import { describe, expect, it } from "vitest";

import { renderMonthlyInvoicePaymentLinksHtml } from "../monthlyInvoicePaymentLinkHtml";

describe("renderMonthlyInvoicePaymentLinksHtml", () => {
  it("renders primary link only when fallback matches primary", () => {
    const url = "https://shalean.co.za/pay/invoice/abc?ref=mi_x";
    const html = renderMonthlyInvoicePaymentLinksHtml({
      paymentUrl: url,
      paystackFallbackUrl: url,
    });
    expect(html).toContain(url);
    expect(html).not.toContain("does not open");
  });

  it("renders Paystack fallback when URLs differ", () => {
    const html = renderMonthlyInvoicePaymentLinksHtml({
      paymentUrl: "https://shalean.co.za/pay/invoice/abc?ref=mi_x",
      paystackFallbackUrl: "https://checkout.paystack.com/abc123",
    });
    expect(html).toContain("https://shalean.co.za/pay/invoice/abc?ref=mi_x");
    expect(html).toContain("https://checkout.paystack.com/abc123");
    expect(html).toContain("does not open on your device");
  });

  it("omits fallback when not provided", () => {
    const html = renderMonthlyInvoicePaymentLinksHtml({
      paymentUrl: "https://shalean.co.za/pay/invoice/abc?ref=mi_x",
    });
    expect(html).not.toContain("Paystack");
  });
});
