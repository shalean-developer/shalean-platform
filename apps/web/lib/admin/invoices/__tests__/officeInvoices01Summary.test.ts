import { describe, expect, it } from "vitest";

import {
  buildInvoiceSummary,
  type AdminInvoiceListRow,
} from "../loadAdminInvoiceList";

function row(overrides: Partial<AdminInvoiceListRow>): AdminInvoiceListRow {
  return {
    id: crypto.randomUUID(),
    customer_id: crypto.randomUUID(),
    month: "2026-10",
    status: "draft",
    total_amount_cents: 0,
    amount_paid_cents: 0,
    balance_cents: 0,
    is_overdue: false,
    is_closed: false,
    due_date: "2026-10-31",
    customer_name: "Test",
    currency_code: "ZAR",
    account_billing_risk: "ok",
    days_overdue: 0,
    last_activity_at: null,
    booking_count: 1,
    has_discount_lines: false,
    has_missed_visit_lines: false,
    view_count: 0,
    first_viewed_at: null,
    zoho_invoice_number: null,
    display_reference: "MI-TEST0001",
    sync_hold_reason: null,
    date_context: "last_visit",
    payment_source: "unpaid",
    ...overrides,
  };
}

describe("OFFICE-INVOICES-01 invoice summary truth", () => {
  it("separates collectible debt from draft forecast while preserving total open balance", () => {
    const summary = buildInvoiceSummary([
      row({ status: "draft", balance_cents: 47_548_00 }),
      row({ status: "sent", balance_cents: 79_774_00 }),
      row({ status: "paid", balance_cents: 0 }),
    ]);

    expect(summary.draft_forecast_cents).toBe(47_548_00);
    expect(summary.collectible_outstanding_cents).toBe(79_774_00);
    expect(summary.total_outstanding_cents).toBe(127_322_00);
    expect(summary.paid_count).toBe(1);
  });

  it("does not count closed historical balances as operational outstanding", () => {
    const summary = buildInvoiceSummary([
      row({ status: "draft", balance_cents: 5_000, is_closed: true }),
      row({ status: "sent", balance_cents: 10_000, is_closed: true }),
    ]);

    expect(summary.draft_forecast_cents).toBe(0);
    expect(summary.collectible_outstanding_cents).toBe(0);
    expect(summary.total_outstanding_cents).toBe(0);
  });

  it("counts overdue only from the canonical computed flag", () => {
    const summary = buildInvoiceSummary([
      row({ status: "sent", balance_cents: 10_000, is_overdue: true }),
      row({ status: "sent", balance_cents: 20_000, is_overdue: false }),
      row({ status: "paid", balance_cents: 0, is_overdue: true }),
    ]);

    expect(summary.overdue_count).toBe(1);
  });
});
