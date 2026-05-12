import { describe, expect, it } from "vitest";

import { allocateMonthlyChildPaymentCents } from "@/lib/monthlyInvoice/allocateMonthlyChildPaymentCents";

/**
 * Production Readiness Audit H-1.
 *
 * Locks the canonical per-booking allocation rule used by every monthly
 * invoice settlement path. Before H-1, `applyMonthlyInvoicePayment` only
 * read `amount_paid_cents` (which is `0` in steady state), producing
 * `payment_status='success' AND amount_paid_cents=0` rows after a paid
 * Paystack monthly invoice.
 */
describe("allocateMonthlyChildPaymentCents (canonical monthly child allocator)", () => {
  it("prefers total_paid_zar * 100 when positive", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 1234.5, amount_paid_cents: 0 })).toBe(123450);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 800, amount_paid_cents: 0 })).toBe(80000);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 800, amount_paid_cents: null })).toBe(80000);
  });

  it("rounds to nearest cent (Math.round, mirrors finalize/manual paths)", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 1.014, amount_paid_cents: 0 })).toBe(101);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 1.016, amount_paid_cents: 0 })).toBe(102);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 549.99, amount_paid_cents: 0 })).toBe(54999);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 549.999, amount_paid_cents: 0 })).toBe(55000);
  });

  it("falls back to existing amount_paid_cents when total_paid_zar is null/zero", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: null, amount_paid_cents: 50000 })).toBe(50000);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 0, amount_paid_cents: 50000 })).toBe(50000);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: undefined, amount_paid_cents: 12345 })).toBe(12345);
  });

  it("returns 0 only when both inputs are missing/zero/non-numeric", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: 0, amount_paid_cents: 0 })).toBe(0);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: null, amount_paid_cents: null })).toBe(0);
    expect(allocateMonthlyChildPaymentCents({})).toBe(0);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: "abc", amount_paid_cents: "xyz" as unknown as number })).toBe(0);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: -10, amount_paid_cents: -5 })).toBe(0);
  });

  it("never returns a negative value", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: -5, amount_paid_cents: 0 })).toBe(0);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: -5, amount_paid_cents: 100 })).toBe(100);
  });

  it("accepts string-typed totals (Postgres numeric serialised as string)", () => {
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: "1500.00", amount_paid_cents: 0 })).toBe(150000);
    expect(allocateMonthlyChildPaymentCents({ total_paid_zar: "0", amount_paid_cents: "12345" as unknown as number })).toBe(12345);
  });
});
