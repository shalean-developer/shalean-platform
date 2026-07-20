import { describe, expect, it } from "vitest";

import {
  MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE,
  monthlyInvoiceChargeMatchesRemainingBalance,
  parseBalanceSuffixFromPaystackReference,
  paystackReferenceMatchesCurrentBalance,
} from "@/lib/monthlyInvoice/monthlyInvoiceAmountIntegrity";
import {
  monthlyInvoicePaystackReferenceForInitialize,
  monthlyInvoiceReopenedDraftPaystackReference,
  stableMonthlyInvoicePaystackReference,
} from "@/lib/monthlyInvoice/monthlyInvoiceStablePaystackReference";
import { interpretMonthlyInvoiceOutcome } from "@/lib/booking/routePaystackChargeForMonthlyInvoice";
import { trustMonthlyInvoicePayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { decidePersistMonthlyInvoicePaystackReference } from "@/lib/monthlyInvoice/persistMonthlyInvoicePaystackReferenceDecision";

describe("monthlyInvoiceAmountIntegrity (BILL-INV-002 Phase A)", () => {
  it("parses _b{cents} suffix", () => {
    expect(parseBalanceSuffixFromPaystackReference("mi_inv_x_202607_b152000")).toBe(152000);
    expect(parseBalanceSuffixFromPaystackReference("mi_inv_x_202607")).toBeNull();
  });

  it("matches charge to remaining balance exactly", () => {
    expect(monthlyInvoiceChargeMatchesRemainingBalance(152000, 152000)).toBe(true);
    expect(monthlyInvoiceChargeMatchesRemainingBalance(151999, 152000)).toBe(false);
    expect(monthlyInvoiceChargeMatchesRemainingBalance(152000, 0)).toBe(false);
  });

  it("requires balance-bound paystack reference for freshness", () => {
    expect(paystackReferenceMatchesCurrentBalance("mi_inv_x_202607_b152000", 152000)).toBe(true);
    expect(paystackReferenceMatchesCurrentBalance("mi_inv_x_202607_b152000", 160000)).toBe(false);
    expect(paystackReferenceMatchesCurrentBalance("mi_inv_x_202607", 152000)).toBe(false);
  });

  it("binds draft initialize refs to balance", () => {
    const invoiceId = "04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1";
    expect(
      monthlyInvoicePaystackReferenceForInitialize({
        id: invoiceId,
        month: "2026-07",
        status: "draft",
        balance_cents: 152000,
        paystack_reference: null,
      }),
    ).toBe(`${stableMonthlyInvoicePaystackReference(invoiceId, "2026-07")}_b152000`);
  });

  it("binds reopen draft refs to current balance", () => {
    const invoiceId = "04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1";
    const rotated = monthlyInvoiceReopenedDraftPaystackReference(invoiceId, "2026-07", 1_720_000_000_000);
    expect(
      monthlyInvoicePaystackReferenceForInitialize({
        id: invoiceId,
        month: "2026-07",
        status: "draft",
        balance_cents: 99000,
        paystack_reference: rotated,
      }),
    ).toBe(`${rotated}_b99000`);
  });

  it("routes amount mismatch quarantine as short-circuit (not booking fall-through)", () => {
    const routing = interpretMonthlyInvoiceOutcome({
      ok: true,
      skipped: true,
      reason: MONTHLY_INVOICE_AMOUNT_MISMATCH_QUARANTINE,
    });
    expect(routing).toEqual({
      kind: "monthly_already_processed",
      reason: "amount_mismatch_quarantined",
    });
  });

  it("builds branded monthly pay URLs", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    const url = trustMonthlyInvoicePayPageUrl(
      "04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1",
      "mi_inv_04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1_202607_b100",
      "https://checkout.paystack.com/abc",
    );
    expect(url).toContain("https://shalean.co.za/pay/invoice/");
    expect(url).toContain("ref=mi_inv_");
    expect(url).not.toContain("checkout.paystack.com");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});

describe("decidePersistMonthlyInvoicePaystackReference (BILL-INV-002 Phase A)", () => {
  it("rotates cleared-link refs for sent invoices after balance change", () => {
    expect(
      decidePersistMonthlyInvoicePaystackReference({
        status: "sent",
        existingReference: "mi_inv_x_202607_b100000",
        nextReference: "mi_inv_x_202607_b120000",
        paymentLink: null,
      }),
    ).toEqual({
      action: "rotate_cleared_link",
      statuses: ["draft", "sent", "partially_paid", "overdue"],
    });
  });

  it("blocks rotation while an active payment_link remains", () => {
    expect(
      decidePersistMonthlyInvoicePaystackReference({
        status: "sent",
        existingReference: "mi_inv_x_202607_b100000",
        nextReference: "mi_inv_x_202607_b120000",
        paymentLink: "https://checkout.paystack.com/abc",
      }),
    ).toEqual({ action: "conflict_active_link" });
  });
});
