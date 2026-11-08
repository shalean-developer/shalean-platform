import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardSummaryPayload } from "@/hooks/useDashboardSummary";
import AccountHomePage from "@/app/(ui-redesign)/account/page";

const state = vi.hoisted(() => ({ summary: null as DashboardSummaryPayload | null }));
vi.mock("@/hooks/useDashboardSummary", () => ({ useDashboardSummary: () => ({ summary: state.summary, loading: false, error: null, refetch: vi.fn() }) }));

function renderInvoice(status: string, hasOverdueInvoice: boolean, isOverdue: boolean) {
  state.summary = {
    ym: "2026-11", bookingsThisMonthCount: 0, hoursBookedThisMonth: 0, completedThisMonthCount: 0, totalSpentThisMonthCents: 0, perVisitInvoices: [], hasAnyInvoices: true, daysOverdue: hasOverdueInvoice ? 3 : 0,
    recentBookings: [], nextBooking: null, hasOverdueInvoice, isOverdue,
    invoiceThisMonth: { id: "current", status, balance_cents: 123456, total_amount_cents: 123456, amount_paid_cents: 0, customer_id: "customer", month: "2026-11", total_bookings: 1, due_date: "2026-11-10", sent_at: null, finalized_at: null, is_overdue: isOverdue, is_closed: false, currency_code: "ZAR", created_at: "2026-11-01", updated_at: "2026-11-01" },
  };
  return renderToStaticMarkup(React.createElement(AccountHomePage));
}

describe("Home invoice alerts", () => {
  it("does not label the current balance as an older invoice's overdue debt", () => {
    const html = renderInvoice("sent", true, false);
    expect(html).toContain("Overdue invoice");
    expect(html).not.toContain("outstanding");
    expect(html).toContain('href="/account/invoices"');
  });
  it("shows the balance when the displayed invoice itself is overdue", () => {
    const html = renderInvoice("overdue", true, true);
    expect(html).toContain("Overdue invoice");
    expect(html).toContain("outstanding");
  });
  it("shows a payable invoice without marking it overdue", () => {
    const html = renderInvoice("sent", false, false);
    expect(html).toContain("Payment due");
    expect(html).toContain("outstanding");
    expect(html).not.toContain("Overdue invoice");
  });
  it.each(["draft", "paid"])("does not request payment for a %s invoice", (status) => {
    const html = renderInvoice(status, false, false);
    expect(html).not.toContain("Payment due");
    expect(html).not.toContain("outstanding");
  });
});
