import { describe, expect, it } from "vitest";

import {
  monthlyInvoicePaystackReferenceForInitialize,
  monthlyInvoiceReopenedDraftPaystackReference,
  stableMonthlyInvoicePaystackReference,
} from "@/lib/monthlyInvoice/monthlyInvoiceStablePaystackReference";

describe("monthlyInvoiceStablePaystackReference", () => {
  const invoiceId = "04e5eac5-5da6-4b86-b2af-3b6b7fe2cec1";

  it("keeps rotated reopen refs for draft initialize", () => {
    const rotated = monthlyInvoiceReopenedDraftPaystackReference(invoiceId, "2026-07", 1_720_000_000_000);
    expect(rotated).toBe(
      `${stableMonthlyInvoicePaystackReference(invoiceId, "2026-07")}_r1720000000000`,
    );
    expect(
      monthlyInvoicePaystackReferenceForInitialize({
        id: invoiceId,
        month: "2026-07",
        status: "draft",
        balance_cents: 152000,
        paystack_reference: rotated,
      }),
    ).toBe(`${rotated}_b152000`);
  });

  it("uses base stable ref with balance suffix for first-time drafts", () => {
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
});
