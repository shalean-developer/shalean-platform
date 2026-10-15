import { describe, expect, it, vi } from "vitest";

import { occurrenceDatesInclusive } from "@/lib/recurring/calculateNextRunDate";
import {
  reconcileRecurringPlanOccurrences,
  bookingsInReconcileMonth,
  reconcileMonthsForPlan,
  reconcileOrphanCancelBlockReason,
} from "@/lib/recurring/reconcileRecurringPlanOccurrences";

describe("reconcileMonthsForPlan", () => {
  it("includes draft invoice months even when service dates span months", () => {
    const months = reconcileMonthsForPlan(
      "2026-01-01",
      null,
      [
        {
          id: "b1",
          date: "2026-05-31",
          status: "pending",
          cleaner_line_earnings_finalized_at: null,
          monthly_invoice_id: "inv-june",
          invoice_status: "draft",
          invoice_month: "2026-06",
        },
      ],
      "2026-06",
    );
    expect(months).toContain("2026-06");
    expect(months).toContain("2026-05");
  });
});

describe("bookingsInReconcileMonth", () => {
  it("includes bookings attached to the draft invoice month", () => {
    const rows = bookingsInReconcileMonth(
      [
        {
          id: "b1",
          date: "2026-05-31",
          status: "pending",
          cleaner_line_earnings_finalized_at: null,
          monthly_invoice_id: "inv-june",
          invoice_status: "draft",
          invoice_month: "2026-06",
        },
      ],
      "2026-06",
      "2026-06-01",
      "2026-06-30",
    );
    expect(rows).toHaveLength(1);
  });
});

describe("reconcileOrphanCancelBlockReason", () => {
  const base = {
    id: "b1",
    date: "2026-06-10",
    monthly_invoice_id: "inv-1",
    invoice_month: "2026-06",
  };

  it("allows draft-invoice orphans even with finalized earnings or completed status", () => {
    expect(
      reconcileOrphanCancelBlockReason({
        ...base,
        status: "completed",
        cleaner_line_earnings_finalized_at: "2026-06-10T10:00:00Z",
        invoice_status: "draft",
      }),
    ).toBeNull();
    expect(
      reconcileOrphanCancelBlockReason({
        ...base,
        status: "in_progress",
        cleaner_line_earnings_finalized_at: "2026-06-10T10:00:00Z",
        invoice_status: "draft",
      }),
    ).toBeNull();
  });

  it("blocks sent or paid invoice visits", () => {
    expect(
      reconcileOrphanCancelBlockReason({
        ...base,
        status: "pending",
        cleaner_line_earnings_finalized_at: null,
        invoice_status: "sent",
      }),
    ).toBe("locked_invoice");
  });
});

describe("weekly schedule orphan math", () => {
  it("1 weekday/week in June yields fewer dates than 2 weekdays/week", () => {
    const from = "2026-06-01";
    const through = "2026-06-30";
    const oneDay = occurrenceDatesInclusive(
      {
        frequency: "weekly",
        days_of_week: [2],
        start_date: "2026-01-01",
        end_date: null,
      },
      from,
      through,
    );
    const twoDays = occurrenceDatesInclusive(
      {
        frequency: "weekly",
        days_of_week: [2, 4],
        start_date: "2026-01-01",
        end_date: null,
      },
      from,
      through,
    );
    expect(oneDay.length).toBeGreaterThanOrEqual(4);
    expect(oneDay.length).toBeLessThanOrEqual(5);
    expect(twoDays.length).toBeGreaterThanOrEqual(8);
    expect(twoDays.length).toBeLessThanOrEqual(9);
    expect(twoDays.length - oneDay.length).toBeGreaterThanOrEqual(4);
  });
});


describe("historical schedule reconciliation cutoff", () => {
  it("does not cancel or create historical visits, including dates attached to October invoices", async () => {
    const writes = vi.fn(() => { throw new Error("Historical write attempted"); });
    const historical = { id: "old", date: "2026-09-30", status: "pending", monthly_invoice_id: "invoice", monthly_invoices: {status: "draft", month: "2026-10"} };
    const admin = {
      auth: {admin: {getUserById: async () => ({data: {user: {email: "fixture@example.test"}}})}},
      from: (table: string) => {
        const q = {select: () => q, eq: () => q, neq: () => q,
          maybeSingle: async () => ({data: {billing_type: "monthly"}, error: null}),
          then: (resolve: (r: unknown) => unknown) => Promise.resolve({data: [historical], error: null}).then(resolve),
          update: writes, insert: writes, delete: writes};
        expect(["bookings", "user_profiles"]).toContain(table);
        return q;
      }, rpc: writes,
    };
    const result = await reconcileRecurringPlanOccurrences(admin as never, {
      id: "plan", customer_id: "customer", price: 100, booking_snapshot_template: {},
      frequency: "weekly", days_of_week: [1], start_date: "2026-07-01", end_date: "2026-09-30",
    });
    expect(result).toMatchObject({bookings_created: 0, bookings_cancelled: 0, errors: []});
    expect(writes).not.toHaveBeenCalled();
  });
});
