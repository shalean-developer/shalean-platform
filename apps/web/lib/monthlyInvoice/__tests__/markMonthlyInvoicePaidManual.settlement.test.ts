import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/bookingOperations", () => ({
  refreshRecurringBookingPaymentState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/monthlyInvoice/invoiceSnapshotEvents", () => ({
  appendMonthlyInvoiceSnapshotEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

import { markMonthlyInvoicePaidManual } from "@/lib/monthlyInvoice/markMonthlyInvoicePaidManual";

type BookingChild = {
  id: string;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_payout_cents: number | null;
};

function buildAdmin(opts: {
  invoice?: {
    id: string;
    status: string;
    total_amount_cents: number;
    amount_paid_cents: number;
    is_closed: boolean;
  };
  children: BookingChild[];
  failingBookingIds?: string[];
}) {
  const captured = {
    invoiceUpdates: [] as Record<string, unknown>[],
    bookingUpdates: [] as Array<{ bookingId: string; patch: Record<string, unknown> }>,
  };
  const failing = new Set(opts.failingBookingIds ?? []);

  const admin = {
    from(table: string) {
      if (table === "monthly_invoices") {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: opts.invoice ?? null, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            captured.invoiceUpdates.push(patch);
            return {
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      if (table === "bookings") {
        return {
          select: (_cols: string, opts2?: { count?: string; head?: boolean }) => ({
            eq: (_col: string, _bookingId?: string) => ({
              neq: async () =>
                opts2?.head
                  ? { count: opts.children.length, error: null }
                  : { data: opts.children, error: null },
              maybeSingle: async () => ({
                data: { payment_completed_at: null, paid_at: null, completed_at: null },
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, bookingId: string) => {
              captured.bookingUpdates.push({ bookingId, patch });
              if (failing.has(bookingId)) return { error: { message: `booking update failed:${bookingId}` } };
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { admin, captured };
}

describe("markMonthlyInvoicePaidManual settlement aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the invoice paid and settles all child bookings", async () => {
    const children: BookingChild[] = [
      {
        id: "booking-1",
        total_paid_zar: 500,
        amount_paid_cents: 0,
        display_earnings_cents: 25_000,
        cleaner_payout_cents: 20_000,
      },
      {
        id: "booking-2",
        total_paid_zar: 600,
        amount_paid_cents: 0,
        display_earnings_cents: 30_000,
        cleaner_payout_cents: 20_000,
      },
    ];
    const { admin, captured } = buildAdmin({
      invoice: {
        id: "invoice-1",
        status: "sent",
        total_amount_cents: 110_000,
        amount_paid_cents: 0,
        is_closed: false,
      },
      children,
    });

    const result = await markMonthlyInvoicePaidManual(admin as never, {
      invoiceId: "invoice-1",
      adminEmail: "ops@example.com",
      adminUserId: "admin-1",
    });

    expect(result).toEqual({ ok: true });
    expect(captured.invoiceUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(captured.bookingUpdates.map((u) => u.bookingId)).toEqual(["booking-1", "booking-2"]);
    expect(captured.bookingUpdates[0].patch).toMatchObject({
      payment_status: "success",
      payout_status: "eligible",
      payout_frozen_cents: 25_000,
    });
  });

  it("returns a partial-settlement error when a child booking fails", async () => {
    const children: BookingChild[] = [
      {
        id: "booking-1",
        total_paid_zar: 500,
        amount_paid_cents: 0,
        display_earnings_cents: 25_000,
        cleaner_payout_cents: 20_000,
      },
      {
        id: "booking-2",
        total_paid_zar: 600,
        amount_paid_cents: 0,
        display_earnings_cents: 30_000,
        cleaner_payout_cents: 20_000,
      },
    ];
    const { admin, captured } = buildAdmin({
      invoice: {
        id: "invoice-2",
        status: "sent",
        total_amount_cents: 110_000,
        amount_paid_cents: 0,
        is_closed: false,
      },
      children,
      failingBookingIds: ["booking-2"],
    });

    const result = await markMonthlyInvoicePaidManual(admin as never, {
      invoiceId: "invoice-2",
      adminEmail: "ops@example.com",
      adminUserId: "admin-1",
    });

    expect(result).toEqual({
      ok: false,
      error: "monthly_invoice_child_settlement_partial:invoice-2:settled=1:failed=1",
    });
    expect(captured.invoiceUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(captured.bookingUpdates.map((u) => u.bookingId)).toEqual(["booking-1", "booking-2"]);
  });
});
