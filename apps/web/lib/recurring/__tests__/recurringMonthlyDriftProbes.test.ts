import { describe, expect, it } from "vitest";

import {
  buildRecurringGenerationParityDiagnostics,
  detectRecurringMonthlyDrift,
  detectRecurringMonthlyDriftForRows,
  type RecurringMonthlyDriftBookingRow,
} from "@/lib/recurring/recurringMonthlyDriftProbes";

function booking(overrides: Partial<RecurringMonthlyDriftBookingRow> = {}): RecurringMonthlyDriftBookingRow {
  return {
    id: "booking-1",
    recurring_id: "recurring-1",
    is_recurring_generated: true,
    is_monthly_billing_booking: true,
    billing_type: "recurring_invoice",
    monthly_invoice_id: "invoice-1",
    status: "completed",
    payment_status: "success",
    payout_status: "eligible",
    payout_frozen_cents: 30_000,
    display_earnings_cents: 30_000,
    cleaner_payout_cents: 30_000,
    cleaner_id: "cleaner-1",
    duration_minutes: 180,
    extras: [{ slug: "fridge", name: "Fridge", price: 120 }],
    total_paid_zar: 950,
    amount_paid_cents: 0,
    booking_snapshot: {
      locked: {
        price: 950,
        finalPrice: 950,
        duration: 3,
        finalHours: 3,
        extras: ["fridge"],
        extras_line_items: [{ slug: "fridge", name: "Fridge", price: 120 }],
      },
    },
    ...overrides,
  };
}

describe("recurring monthly drift probes", () => {
  it("does not flag a settled recurring monthly child with matching snapshot parity", () => {
    const findings = detectRecurringMonthlyDrift({
      booking: booking(),
      invoice: { id: "invoice-1", status: "paid" },
      recurringTemplate: {
        id: "recurring-1",
        price: 950,
        booking_snapshot_template: {
          locked: {
            price: 950,
            finalPrice: 950,
            duration: 3,
            finalHours: 3,
            extras_line_items: [{ slug: "fridge", name: "Fridge", price: 120 }],
          },
        },
      },
      expectedCanonicalDurationMinutes: 180,
      expectedCanonicalPriceCents: 95_000,
    });

    expect(findings).toEqual([]);
  });

  it("detects paid invoice children that were not fully settled", () => {
    const findings = detectRecurringMonthlyDrift({
      booking: booking({
        payment_status: "pending_monthly",
        payout_status: null,
        payout_frozen_cents: null,
      }),
      invoice: { id: "invoice-1", status: "paid" },
    });

    expect(findings.map((f) => f.code)).toContain("invoice_paid_child_unsettled");
    expect(findings.find((f) => f.code === "invoice_paid_child_unsettled")).toMatchObject({
      severity: "critical",
      repairability: "auto_repair_candidate",
      monthlyInvoiceId: "invoice-1",
    });
  });

  it("detects missing frozen payout cents without flagging unpaid invoice rows", () => {
    const paidFindings = detectRecurringMonthlyDrift({
      booking: booking({ payout_frozen_cents: null }),
      invoice: { id: "invoice-1", status: "paid" },
    });
    expect(paidFindings.map((f) => f.code)).toContain("recurring_child_missing_payout_frozen_cents");

    const sentFindings = detectRecurringMonthlyDrift({
      booking: booking({ payment_status: "pending_monthly", payout_status: null, payout_frozen_cents: null }),
      invoice: { id: "invoice-1", status: "sent" },
    });
    expect(sentFindings.map((f) => f.code)).not.toContain("recurring_child_missing_payout_frozen_cents");
    expect(sentFindings.map((f) => f.code)).not.toContain("invoice_paid_child_unsettled");
  });

  it("detects missing display earnings and duration only for recurring children that need diagnostics", () => {
    const findings = detectRecurringMonthlyDrift({
      booking: booking({
        display_earnings_cents: null,
        duration_minutes: null,
      }),
      invoice: { id: "invoice-1", status: "paid" },
    });

    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        "recurring_child_missing_display_earnings_cents",
        "recurring_child_missing_duration_minutes",
      ]),
    );
    expect(findings.find((f) => f.code === "recurring_child_missing_display_earnings_cents")?.fallbackUsage).toEqual({
      used: true,
      sources: ["cleaner_payout_cents"],
    });

    expect(
      detectRecurringMonthlyDrift({
        booking: booking({
          is_recurring_generated: false,
          recurring_id: null,
          is_monthly_billing_booking: false,
          billing_type: null,
          display_earnings_cents: null,
          duration_minutes: null,
        }),
        invoice: { id: "invoice-1", status: "paid" },
      }),
    ).toEqual([]);
  });

  it("detects recurring extras parity mismatch, including the empty-row-extras snapshot fallback risk", () => {
    const findings = detectRecurringMonthlyDrift({
      booking: booking({ extras: [] }),
      invoice: { id: "invoice-1", status: "paid" },
    });

    const mismatch = findings.find((f) => f.code === "recurring_child_extras_parity_mismatch");
    expect(mismatch).toMatchObject({
      severity: "high",
      repairability: "template_review_required",
      fallbackUsage: { used: true, sources: ["booking_snapshot.locked.extras_line_items"] },
    });
    expect(mismatch?.diagnostics).toMatchObject({ rowExtrasCount: 0, snapshotExtrasCount: 1 });
  });

  it("detects stale pricing and stale duration drift from snapshot, template, and supplied canonical expectations", () => {
    const findings = detectRecurringMonthlyDrift({
      booking: booking({
        total_paid_zar: 950,
        duration_minutes: 180,
        booking_snapshot: {
          locked: {
            price: 850,
            finalPrice: 850,
            duration: 2.5,
            finalHours: 2.5,
            extras_line_items: [{ slug: "fridge", name: "Fridge", price: 120 }],
          },
        },
      }),
      invoice: { id: "invoice-1", status: "paid" },
      recurringTemplate: {
        id: "recurring-1",
        price: 900,
        booking_snapshot_template: {
          locked: {
            price: 900,
            finalPrice: 900,
            duration: 2.75,
            finalHours: 2.75,
            extras_line_items: [{ slug: "fridge", name: "Fridge", price: 120 }],
          },
        },
      },
      expectedCanonicalDurationMinutes: 240,
      expectedCanonicalPriceCents: 100_000,
    });

    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["recurring_stale_pricing_drift", "recurring_stale_duration_drift"]),
    );
    expect(findings.find((f) => f.code === "recurring_stale_pricing_drift")?.diagnostics).toMatchObject({
      childPriceCents: 95_000,
      snapshotPriceCents: 85_000,
      templatePriceCents: 90_000,
      expectedCanonicalPriceCents: 100_000,
    });
  });

  it("detects payout eligibility drift in both unsafe-eligible and missing-eligible directions", () => {
    const unsafeEligible = detectRecurringMonthlyDrift({
      booking: booking({ payment_status: "pending_monthly", payout_status: "eligible" }),
      invoice: { id: "invoice-1", status: "sent" },
    });
    expect(unsafeEligible.map((f) => f.code)).toContain("recurring_payout_eligibility_drift");

    const missingEligible = detectRecurringMonthlyDrift({
      booking: booking({ payout_status: "pending" }),
      invoice: { id: "invoice-1", status: "paid" },
    });
    expect(missingEligible.map((f) => f.code)).toContain("recurring_payout_eligibility_drift");
  });

  it("provides generation parity diagnostics and row aggregation without writes", () => {
    const diagnostics = buildRecurringGenerationParityDiagnostics({
      booking: booking({ amount_paid_cents: 95_000, total_paid_zar: 1 }),
      invoice: { id: "invoice-1", status: "paid" },
    });

    expect(diagnostics).toMatchObject({
      amountSource: "amount_paid_cents",
      childPriceCents: 95_000,
      snapshotPriceCents: 95_000,
      persistedDurationMinutes: 180,
      snapshotDurationMinutes: 180,
      parity: {
        priceMatchesSnapshot: true,
        durationMatchesSnapshot: true,
        extrasMatchSnapshot: true,
      },
    });

    const findings = detectRecurringMonthlyDriftForRows(
      [booking({ id: "booking-1" }), booking({ id: "booking-2", payout_frozen_cents: null })],
      {
        invoicesById: new Map([["invoice-1", { id: "invoice-1", status: "paid" }]]),
      },
    );

    expect(findings.map((f) => `${f.bookingId}:${f.code}`)).toContain(
      "booking-2:recurring_child_missing_payout_frozen_cents",
    );
  });
});
