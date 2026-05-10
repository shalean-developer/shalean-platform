import { describe, expect, it } from "vitest";

import { monthlyInvoiceProbeEPaymentStateDrift } from "@/lib/monthlyInvoice/repairMonthlyInvoicePaymentStateDriftProbeE";

describe("monthlyInvoiceProbeEPaymentStateDrift (Probe E payment_state slice)", () => {
  it("treats null, empty, and non-charged as drift", () => {
    expect(monthlyInvoiceProbeEPaymentStateDrift(null)).toBe(true);
    expect(monthlyInvoiceProbeEPaymentStateDrift(undefined)).toBe(true);
    expect(monthlyInvoiceProbeEPaymentStateDrift("")).toBe(true);
    expect(monthlyInvoiceProbeEPaymentStateDrift("  ")).toBe(true);
    expect(monthlyInvoiceProbeEPaymentStateDrift("pending")).toBe(true);
  });

  it("treats charged (case-insensitive, trim) as aligned", () => {
    expect(monthlyInvoiceProbeEPaymentStateDrift("charged")).toBe(false);
    expect(monthlyInvoiceProbeEPaymentStateDrift(" Charged ")).toBe(false);
  });
});
