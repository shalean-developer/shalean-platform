import { describe, expect, it } from "vitest";

import {
  buildInvoiceCsv,
  getInvoiceOperationalStatus,
  getMonthBalanceBreakdown,
  type InvoiceUiRow,
} from "../officeInvoices03Ui";

function row(overrides: Partial<InvoiceUiRow> = {}): InvoiceUiRow {
  return {
    id: "inv-1",
    month: "2026-10",
    customer_name: "Test Customer",
    customer_id: "customer-1",
    status: "draft",
    total_amount_cents: 100_00,
    amount_paid_cents: 0,
    balance_cents: 100_00,
    currency_code: "ZAR",
    is_overdue: false,
    is_closed: false,
    due_date: "2026-10-31",
    booking_count: 1,
    view_count: 0,
    display_reference: "MI-INV1",
    sync_hold_reason: null,
    date_context: "last_visit",
    payment_source: "unpaid",
    ...overrides,
  };
}

describe("OFFICE-INVOICES-03A UI truth", () => {
  it("promotes canonical overdue state over stored sent status", () => {
    expect(getInvoiceOperationalStatus(row({ status: "sent", is_overdue: true }))).toBe("overdue");
    expect(getInvoiceOperationalStatus(row({ status: "sent", is_overdue: false }))).toBe("sent");
    expect(getInvoiceOperationalStatus(row({ status: "paid", is_overdue: true, balance_cents: 0 }))).toBe("paid");
  });

  it("separates collectible balances from draft forecast per month", () => {
    expect(
      getMonthBalanceBreakdown([
        row({ status: "draft", balance_cents: 20_000 }),
        row({ status: "sent", balance_cents: 30_000 }),
        row({ status: "paid", balance_cents: 0, is_closed: true }),
      ]),
    ).toEqual({
      collectible_cents: 30_000,
      draft_forecast_cents: 20_000,
      open_balance_cents: 50_000,
    });
  });

  it("exports operational references, overdue truth, and quoted customer names", () => {
    const csv = buildInvoiceCsv([
      row({
        status: "sent",
        is_overdue: true,
        customer_name: 'Acme, "Cape Town"',
        display_reference: "INV-001893",
        date_context: "due",
        due_date: "2026-09-23",
      }),
    ]);
    expect(csv).toContain("INV-001893");
    expect(csv).toContain("overdue");
    expect(csv).toContain('"Acme, ""Cape Town"""');
    expect(csv).toContain("Due,2026-09-23");
    expect(csv).toContain("Payment source");
  });
});
