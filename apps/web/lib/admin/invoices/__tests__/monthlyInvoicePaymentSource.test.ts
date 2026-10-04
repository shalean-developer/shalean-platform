import { describe, expect, it } from "vitest";

import {
  monthlyInvoicePaymentSourceLabel,
  resolveMonthlyInvoicePaymentSource,
} from "../monthlyInvoicePaymentSource";

describe("OFFICE-INVOICES-04C payment-source truth", () => {
  it("resolves Paystack from gateway evidence", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 80_000,
        amountPaidCents: 80_000,
        hasPaystackLedger: true,
      }),
    ).toBe("paystack");
  });

  it("resolves manual settlement from admin mark-paid evidence", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 80_000,
        amountPaidCents: 80_000,
        eventKinds: ["invoice_finalized", "admin_mark_paid"],
      }),
    ).toBe("manual_eft");
    expect(monthlyInvoicePaymentSourceLabel("manual_eft")).toBe("Manual / EFT");
  });

  it("does not treat a reverted manual mark-paid as the current payment source", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "draft",
        totalAmountCents: 80_000,
        amountPaidCents: 0,
        eventKinds: ["admin_mark_paid", "admin_revert_to_draft"],
      }),
    ).toBe("unpaid");
  });

  it("allows a later legitimate manual settlement after a prior revert", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 80_000,
        amountPaidCents: 80_000,
        eventKinds: ["admin_mark_paid", "admin_revert_to_draft", "admin_mark_paid"],
      }),
    ).toBe("manual_eft");
  });

  it("resolves zero-value closure explicitly", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 0,
        amountPaidCents: 0,
        closureReason: "zero_amount",
      }),
    ).toBe("zero_value");
  });

  it("supports Cleaning Credit when explicit evidence exists", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 50_000,
        amountPaidCents: 50_000,
        eventKinds: ["cleaning_credit_settled"],
      }),
    ).toBe("cleaning_credit");
  });

  it("reports mixed settlement when multiple genuine sources exist", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 100_000,
        amountPaidCents: 100_000,
        hasPaystackLedger: true,
        eventKinds: ["admin_mark_paid"],
      }),
    ).toBe("mixed");
  });

  it("does not invent a source for historical paid rows without evidence", () => {
    expect(
      resolveMonthlyInvoicePaymentSource({
        status: "paid",
        totalAmountCents: 10_000,
        amountPaidCents: 10_000,
      }),
    ).toBe("unknown");
  });
});
