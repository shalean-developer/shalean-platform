import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/bookingOperations", () => ({
  refreshRecurringBookingPaymentState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

import { refreshRecurringBookingPaymentState } from "@/lib/booking/bookingOperations";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";

function buildAdmin(failingBookingIds: string[] = []) {
  const updates: Array<{ bookingId: string; patch: Record<string, unknown> }> = [];
  const fail = new Set(failingBookingIds);
  const admin = {
    from(table: string) {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_col: string, _bookingId: string) => ({
            maybeSingle: async () => ({
              data: { payment_completed_at: null, paid_at: null, completed_at: null },
              error: null,
            }),
            neq: async () => ({ data: [], error: null }),
          }),
        }),
        update(patch: Record<string, unknown>) {
          return {
            eq: async (_col: string, bookingId: string) => {
              updates.push({ bookingId, patch });
              if (fail.has(bookingId)) return { error: { message: `db failed:${bookingId}` } };
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { admin, updates };
}

describe("settleMonthlyInvoiceChildren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("settles all children and refreshes recurring payment state", async () => {
    const { admin, updates } = buildAdmin();

    const result = await settleMonthlyInvoiceChildren(admin as never, {
      invoiceId: "invoice-1",
      source: "test",
      children: [
        {
          id: "booking-1",
          total_paid_zar: 800,
          amount_paid_cents: 0,
          display_earnings_cents: 25_000,
          cleaner_payout_cents: 20_000,
        },
        {
          id: "booking-2",
          total_paid_zar: null,
          amount_paid_cents: 12_345,
          display_earnings_cents: 30_000,
          cleaner_payout_cents: 20_000,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      invoiceId: "invoice-1",
      attempted: 2,
      settled: 2,
      failed: 0,
      failures: [],
    });
    expect(updates).toEqual([
      {
        bookingId: "booking-1",
        patch: {
          payment_status: "success",
          amount_paid_cents: 80_000,
          payout_status: "eligible",
          payout_frozen_cents: 25_000,
          payment_completed_at: expect.any(String),
        },
      },
      {
        bookingId: "booking-2",
        patch: {
          payment_status: "success",
          amount_paid_cents: 12_345,
          payout_status: "eligible",
          payout_frozen_cents: 30_000,
          payment_completed_at: expect.any(String),
        },
      },
    ]);
    expect(refreshRecurringBookingPaymentState).toHaveBeenCalledTimes(2);
  });

  it("aggregates child settlement failures instead of reporting full success", async () => {
    const { admin, updates } = buildAdmin(["booking-2"]);

    const result = await settleMonthlyInvoiceChildren(admin as never, {
      invoiceId: "invoice-2",
      source: "test",
      reference: "manual",
      children: [
        {
          id: "booking-1",
          total_paid_zar: 800,
          amount_paid_cents: 0,
          display_earnings_cents: 25_000,
          cleaner_payout_cents: 20_000,
        },
        {
          id: "booking-2",
          total_paid_zar: 900,
          amount_paid_cents: 0,
          display_earnings_cents: 30_000,
          cleaner_payout_cents: 20_000,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      invoiceId: "invoice-2",
      attempted: 2,
      settled: 1,
      failed: 1,
      error: "monthly_invoice_child_settlement_partial:invoice-2:settled=1:failed=1",
      failures: [{ bookingId: "booking-2", error: "db failed:booking-2" }],
    });
    expect(updates.map((u) => u.bookingId)).toEqual(["booking-1", "booking-2"]);
    expect(refreshRecurringBookingPaymentState).toHaveBeenCalledTimes(1);
  });

  it("keeps the positive payout_frozen_cents guard and reports missing earnings basis", async () => {
    const { admin, updates } = buildAdmin();

    const result = await settleMonthlyInvoiceChildren(admin as never, {
      invoiceId: "invoice-3",
      source: "test",
      children: [
        {
          id: "booking-missing",
          total_paid_zar: 100,
          amount_paid_cents: 0,
          display_earnings_cents: null,
          cleaner_payout_cents: null,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      failed: 1,
      failures: [{ bookingId: "booking-missing", error: "booking_missing_cleaner_earnings_basis:booking-missing" }],
    });
    expect(updates).toEqual([]);
    expect(refreshRecurringBookingPaymentState).not.toHaveBeenCalled();
  });
});
