import { describe, expect, it } from "vitest";
import {
  assertHybridPayoutWithinFinancialCap,
  bookingPayoutConstraintCapCents,
  bookingUsesAccrualPayoutCap,
} from "@/lib/payout/bookingPayoutCapCents";

describe("bookingUsesAccrualPayoutCap", () => {
  it("is true for pending_monthly", () => {
    expect(
      bookingUsesAccrualPayoutCap({
        billing_type: "prepaid",
        payment_status: "pending_monthly",
      }),
    ).toBe(true);
  });

  it("is true for monthly_invoice_id", () => {
    expect(
      bookingUsesAccrualPayoutCap({
        billing_type: "prepaid",
        monthly_invoice_id: "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe(true);
  });

  it("is true for billing_type recurring_invoice", () => {
    expect(bookingUsesAccrualPayoutCap({ billing_type: "recurring_invoice" })).toBe(true);
  });

  it("is false for plain prepaid pending_payment", () => {
    expect(
      bookingUsesAccrualPayoutCap({
        billing_type: "prepaid",
        payment_status: "pending_payment",
        is_monthly_billing_booking: false,
      }),
    ).toBe(false);
  });
});

describe("bookingPayoutConstraintCapCents", () => {
  it("prepaid: coalesce keeps explicit 0 amount before zar (strict collected path)", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "prepaid",
      payment_status: "pending",
      total_paid_cents: null,
      amount_paid_cents: 0,
      total_paid_zar: 450,
    });
    expect(cap).toBe(0);
  });

  it("prepaid success: uses settled visit subtotal when cash is R0", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "prepaid",
      payment_status: "success",
      total_paid_cents: 0,
      amount_paid_cents: 0,
      total_paid_zar: 0,
      base_amount_cents: 65_000,
    });
    expect(cap).toBe(65_000);
  });

  it("prepaid pending: does not let quoted subtotal authorize payout before settlement", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "prepaid",
      payment_status: "pending",
      total_paid_cents: 0,
      amount_paid_cents: 0,
      total_paid_zar: 0,
      base_amount_cents: 65_000,
    });
    expect(cap).toBe(0);
  });

  it("prepaid success: preserves higher collected-cash cap when cash exceeds visit subtotal", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "prepaid",
      payment_status: "success",
      total_paid_cents: 68_000,
      amount_paid_cents: 68_000,
      total_paid_zar: 680,
      base_amount_cents: 65_000,
    });
    expect(cap).toBe(68_000);
  });

  it("accrual: ignores sentinel 0 amount_paid_cents and uses zar line", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "recurring_invoice",
      payment_status: "pending_monthly",
      total_paid_cents: null,
      amount_paid_cents: 0,
      total_paid_zar: 450,
    });
    expect(cap).toBe(45_000);
  });

  it("accrual: total_paid_cents wins when set", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "recurring_invoice",
      total_paid_cents: 12_000,
      amount_paid_cents: 0,
      total_paid_zar: 999,
    });
    expect(cap).toBe(12_000);
  });

  it("accrual: quoted zar wins before non-zero amount when total_paid_cents is null", () => {
    const cap = bookingPayoutConstraintCapCents({
      billing_type: "recurring_invoice",
      total_paid_cents: null,
      amount_paid_cents: 5000,
      total_paid_zar: 450,
    });
    expect(cap).toBe(45_000);
  });
});

describe("assertHybridPayoutWithinFinancialCap", () => {
  it("allows R300 cleaner payout on a settled R0 prepaid visit worth R650 before service fee", () => {
    const r = assertHybridPayoutWithinFinancialCap({
      row: {
        billing_type: "prepaid",
        payment_status: "success",
        total_paid_cents: 0,
        amount_paid_cents: 0,
        total_paid_zar: 0,
        base_amount_cents: 65_000,
      },
      payoutCents: 30_000,
      bonusCents: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("still rejects payout above the settled visit subtotal", () => {
    const r = assertHybridPayoutWithinFinancialCap({
      row: {
        billing_type: "prepaid",
        payment_status: "success",
        total_paid_cents: 0,
        amount_paid_cents: 0,
        total_paid_zar: 0,
        base_amount_cents: 65_000,
      },
      payoutCents: 66_000,
      bonusCents: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.cap).toBe(65_000);
  });

  it("allows hybrid within accrual cap", () => {
    const r = assertHybridPayoutWithinFinancialCap({
      row: {
        billing_type: "recurring_invoice",
        total_paid_cents: null,
        amount_paid_cents: 0,
        total_paid_zar: 450,
      },
      payoutCents: 25_000,
      bonusCents: 0,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects hybrid above accrual cap", () => {
    const r = assertHybridPayoutWithinFinancialCap({
      row: {
        billing_type: "recurring_invoice",
        total_paid_cents: null,
        amount_paid_cents: 0,
        total_paid_zar: 100,
      },
      payoutCents: 25_000,
      bonusCents: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cap).toBe(10_000);
      expect(r.hybrid).toBe(25_000);
    }
  });
});
