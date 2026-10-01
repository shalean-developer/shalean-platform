import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildInvoiceHumanTimeline } from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

const root = process.cwd();

describe("OFFICE-INVOICES-04A guarded manual-paid reversal", () => {
  it("blocks gateway payments and disbursed payouts in the command boundary", () => {
    const src = readFileSync(
      join(root, "lib/monthlyInvoice/revertManualPaidMonthlyInvoiceToDraft.ts"),
      "utf8",
    );

    expect(src).toContain("monthly_invoice_paystack_charge_dedup");
    expect(src).toContain("payment_transactions");
    expect(src).toContain('"real_paystack_payment_exists"');
    expect(src).toContain("payout_id");
    expect(src).toContain("payout_run_id");
    expect(src).toContain("payout_paid_at");
    expect(src).toContain("booking_payout_already_disbursed");
  });

  it("requires explicit typed confirmation and reason at the API boundary", () => {
    const src = readFileSync(
      join(root, "app/api/admin/invoices/[invoiceId]/revert-to-draft/route.ts"),
      "utf8",
    );

    expect(src).toContain('"REVERT"');
    expect(src).toContain('"reason_required"');
    expect(src).toContain('"revert_manual_paid"');
  });

  it("restores monthly child payment and payout state rather than only changing the invoice label", () => {
    const src = readFileSync(
      join(root, "lib/monthlyInvoice/revertManualPaidMonthlyInvoiceToDraft.ts"),
      "utf8",
    );

    expect(src).toContain('payment_status: "pending_monthly"');
    expect(src).toContain('payout_status: "pending"');
    expect(src).toContain("payout_frozen_cents: null");
    expect(src).toContain("payment_completed_at: null");
    expect(src).toContain('status: "draft"');
    expect(src).toContain("snapshot_at_finalize: null");
    expect(src).toContain("initial_invoice_email_dispatch_claimed: false");
  });

  it("renders a visible audit timeline entry including Zoho reconciliation warning", () => {
    const lines = buildInvoiceHumanTimeline({
      fullEventHistory: [
        {
          created_at: "2026-10-01T14:50:12.000Z",
          payload: {
            kind: "admin_revert_to_draft",
            at: "2026-10-01T14:50:12.000Z",
            admin_email: "admin@example.com",
            reason: "Marked paid by mistake",
            booking_count_restored: 2,
            zoho_reconciliation_required: true,
          },
        },
      ],
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Manual paid status reverted to draft");
    expect(lines[0]).toContain("2 bookings restored");
    expect(lines[0]).toContain("Zoho reconciliation required");
  });
});
