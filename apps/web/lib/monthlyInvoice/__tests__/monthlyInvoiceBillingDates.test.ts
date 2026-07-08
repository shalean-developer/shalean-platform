import { describe, expect, it } from "vitest";

import {
  evaluateMonthlyInvoiceFinalizeReadiness,
  lastScheduledVisitYmd,
} from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import type { RecurringPlanScheduleRow } from "@/lib/recurring/reconcileRecurringPlanOccurrences";
import { zohoDatesForMonthlyInvoice } from "@/lib/monthlyInvoice/monthlyInvoiceBillingDates";

const weeklyPlan: RecurringPlanScheduleRow = {
  id: "plan-1",
  customer_id: "cust-1",
  price: 500,
  frequency: "weekly",
  days_of_week: [1, 4],
  start_date: "2026-06-01",
  end_date: null,
  booking_snapshot_template: {},
  preferred_cleaner_id: null,
  skip_next_occurrence_date: null,
  monthly_pattern: null,
  monthly_nth: null,
};

describe("evaluateMonthlyInvoiceFinalizeReadiness", () => {
  it("waits until the last visit date in the month has passed", () => {
    const result = evaluateMonthlyInvoiceFinalizeReadiness({
      todayYmd: "2026-06-20",
      invoiceId: "inv-1",
      invoiceMonthYm: "2026-06",
      bookingsOnInvoice: [
        { date: "2026-06-05", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
        { date: "2026-06-24", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      ],
      recurringPlans: [weeklyPlan],
      allBookingsByPlanId: new Map([
        [
          "plan-1",
          [
            { date: "2026-06-05", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
            { date: "2026-06-24", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
          ],
        ],
      ]),
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("upcoming_visits_in_month");
  });

  it("finalizes after last visit when recurring schedule is complete", () => {
    const bookings = [
      { date: "2026-06-01", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-04", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-08", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-11", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-15", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-18", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-22", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-25", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      { date: "2026-06-29", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
    ];

    const result = evaluateMonthlyInvoiceFinalizeReadiness({
      todayYmd: "2026-06-29",
      invoiceId: "inv-1",
      invoiceMonthYm: "2026-06",
      bookingsOnInvoice: bookings,
      recurringPlans: [weeklyPlan],
      allBookingsByPlanId: new Map([["plan-1", bookings]]),
    });

    expect(result.ready).toBe(true);
    expect(result.paymentDueDateYmd).toBe("2026-06-29");
    expect(result.lastVisitYmd).toBe("2026-06-29");
  });

  it("blocks when expected recurring visits are missing from the invoice", () => {
    const result = evaluateMonthlyInvoiceFinalizeReadiness({
      todayYmd: "2026-06-30",
      invoiceId: "inv-1",
      invoiceMonthYm: "2026-06",
      bookingsOnInvoice: [
        { date: "2026-06-05", recurring_id: "plan-1", monthly_invoice_id: "inv-1" },
      ],
      recurringPlans: [weeklyPlan],
      allBookingsByPlanId: new Map([
        ["plan-1", [{ date: "2026-06-05", recurring_id: "plan-1", monthly_invoice_id: "inv-1" }]],
      ]),
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("recurring_schedule_incomplete");
  });

  it("holds on-demand monthly invoices until calendar month end", () => {
    const result = evaluateMonthlyInvoiceFinalizeReadiness({
      todayYmd: "2026-07-07",
      invoiceId: "inv-1",
      invoiceMonthYm: "2026-07",
      bookingsOnInvoice: [
        { date: "2026-07-02", recurring_id: null, monthly_invoice_id: "inv-1" },
        { date: "2026-07-07", recurring_id: null, monthly_invoice_id: "inv-1" },
      ],
      recurringPlans: [],
      allBookingsByPlanId: new Map(),
    });

    expect(result.ready).toBe(false);
    expect(result.reason).toBe("invoice_month_not_ended");
    expect(result.lastVisitYmd).toBe("2026-07-07");
  });

  it("finalizes on-demand monthly invoices on the last day of the month", () => {
    const result = evaluateMonthlyInvoiceFinalizeReadiness({
      todayYmd: "2026-07-31",
      invoiceId: "inv-1",
      invoiceMonthYm: "2026-07",
      bookingsOnInvoice: [
        { date: "2026-07-02", recurring_id: null, monthly_invoice_id: "inv-1" },
        { date: "2026-07-07", recurring_id: null, monthly_invoice_id: "inv-1" },
      ],
      recurringPlans: [],
      allBookingsByPlanId: new Map(),
    });

    expect(result.ready).toBe(true);
    expect(result.paymentDueDateYmd).toBe("2026-07-31");
  });
});

describe("zohoDatesForMonthlyInvoice", () => {
  it("uses last visit as provisional due date for open drafts", () => {
    expect(zohoDatesForMonthlyInvoice("2026-06", "2026-06-26")).toEqual({
      invoiceDate: "2026-06-01",
      dueDate: "2026-06-26",
    });
  });
});

describe("lastScheduledVisitYmd", () => {
  it("returns the latest booking date in the invoice month", () => {
    expect(
      lastScheduledVisitYmd("2026-06", ["2026-06-05", "2026-06-26", "2026-07-01"]),
    ).toBe("2026-06-26");
  });
});
