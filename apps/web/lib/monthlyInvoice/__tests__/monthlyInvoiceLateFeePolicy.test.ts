import { describe, expect, it } from "vitest";

import {
  daysOverdueAfterGrace,
  daysPastDueFromYmd,
  isMonthlyInvoiceOverdueWithGrace,
  monthlyInvoiceLateFeeCentsForInvoiceTotal,
  shouldApplyMonthlyInvoiceLateFee,
} from "@/lib/monthlyInvoice/monthlyInvoiceLateFeePolicy";

describe("monthlyInvoiceLateFeePolicy", () => {
  const due = "2026-06-29";

  it("allows 5 calendar days after due before overdue", () => {
    expect(daysPastDueFromYmd(due, "2026-07-04")).toBe(5);
    expect(isMonthlyInvoiceOverdueWithGrace(due, "2026-07-04")).toBe(false);
    expect(daysOverdueAfterGrace(due, "2026-07-04")).toBe(0);
  });

  it("marks overdue from day 6 past due", () => {
    expect(isMonthlyInvoiceOverdueWithGrace(due, "2026-07-05")).toBe(true);
    expect(daysOverdueAfterGrace(due, "2026-07-05")).toBe(1);
    expect(shouldApplyMonthlyInvoiceLateFee(due, "2026-07-05")).toBe(true);
  });

  it("charges 5% with R75 floor and R200 cap", () => {
    expect(monthlyInvoiceLateFeeCentsForInvoiceTotal(80_000)).toBe(7_500); // R800 → R40 → R75
    expect(monthlyInvoiceLateFeeCentsForInvoiceTotal(200_000)).toBe(10_000); // R2 000 → R100
    expect(monthlyInvoiceLateFeeCentsForInvoiceTotal(500_000)).toBe(20_000); // R5 000 → R250 → R200
  });
});
