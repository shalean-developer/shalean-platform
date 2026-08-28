import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/bookingOperations", () => ({
  refreshRecurringBookingPaymentState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/monthlyInvoice/invoiceSnapshotEvents", () => ({
  appendMonthlyInvoiceSnapshotEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

const markZohoInvoicePaid = vi.fn().mockResolvedValue({ ok: true, paymentId: "pay-1" });
const resolveZohoCustomerContactForMonthlyInvoice = vi.fn().mockResolvedValue({
  ok: true,
  contact: { email: "customer@example.com", name: "Customer" },
});

vi.mock("@/lib/zoho/zohoBooksService", () => ({
  markZohoInvoicePaid: (...args: unknown[]) => markZohoInvoicePaid(...args),
  todayYmdJhb: () => "2026-07-11",
}));

vi.mock("@/lib/zoho/resolveZohoCustomerContact", () => ({
  resolveZohoCustomerContactForMonthlyInvoice: (...args: unknown[]) =>
    resolveZohoCustomerContactForMonthlyInvoice(...args),
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
    zoho_invoice_id?: string | null;
    customer_id?: string | null;
  };
  children: BookingChild[];
  failingBookingIds?: string[];
}) {
  const captured = {
    invoiceUpdates: [] as Record<string, unknown>[],
    bookingUpdates: [] as Array<{ bookingId: string; patch: Record<string, unknown> }>,
    paymentTransactions: [] as Record<string, unknown>[],
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
      if (table === "payment_transactions") {
        return {
          insert: async (row: Record<string, unknown>) => {
            captured.paymentTransactions.push(row);
            return { error: null };
          },
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
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
  const prevClientId = process.env.ZOHO_CLIENT_ID;
  const prevRefresh = process.env.ZOHO_REFRESH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ZOHO_CLIENT_ID;
    delete process.env.ZOHO_REFRESH_TOKEN;
  });

  afterEach(() => {
    if (prevClientId === undefined) delete process.env.ZOHO_CLIENT_ID;
    else process.env.ZOHO_CLIENT_ID = prevClientId;
    if (prevRefresh === undefined) delete process.env.ZOHO_REFRESH_TOKEN;
    else process.env.ZOHO_REFRESH_TOKEN = prevRefresh;
  });

  it("marks the invoice paid, records the manual cash ledger, and settles all child bookings", async () => {
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
    expect(captured.paymentTransactions).toEqual([
      expect.objectContaining({
        gateway: "other",
        gateway_reference: "manual:monthly_invoice:invoice-1",
        entity_type: "monthly_invoice",
        entity_id: "invoice-1",
        amount_cents: 110_000,
        net_settlement_cents: 110_000,
        fee_calculation_method: "manual",
        settlement_status: "settled",
        settlement_date: "2026-07-11",
        payment_channel: "manual_eft",
      }),
    ]);
    expect(captured.invoiceUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(captured.bookingUpdates.map((u) => u.bookingId)).toEqual(["booking-1", "booking-2"]);
    expect(captured.bookingUpdates[0].patch).toMatchObject({
      payment_status: "success",
      payout_status: "eligible",
      payout_frozen_cents: 25_000,
    });
    expect(markZohoInvoicePaid).not.toHaveBeenCalled();
  });

  it("records only the remaining amount for a partially paid invoice", async () => {
    const { admin, captured } = buildAdmin({
      invoice: {
        id: "invoice-partial",
        status: "partially_paid",
        total_amount_cents: 80_000,
        amount_paid_cents: 30_000,
        is_closed: false,
      },
      children: [],
    });

    const result = await markMonthlyInvoicePaidManual(admin as never, {
      invoiceId: "invoice-partial",
      adminEmail: "ops@example.com",
      adminUserId: "admin-1",
    });

    expect(result).toEqual({ ok: true });
    expect(captured.paymentTransactions[0]).toMatchObject({
      amount_cents: 50_000,
      net_settlement_cents: 50_000,
      gateway_reference: "manual:monthly_invoice:invoice-partial",
    });
  });

  it("syncs payment to Zoho using the canonical manual reference", async () => {
    process.env.ZOHO_CLIENT_ID = "client";
    process.env.ZOHO_REFRESH_TOKEN = "refresh";

    const { admin } = buildAdmin({
      invoice: {
        id: "invoice-zoho",
        status: "sent",
        total_amount_cents: 50_000,
        amount_paid_cents: 0,
        is_closed: false,
        zoho_invoice_id: "zoho-inv-1",
        customer_id: "cust-1",
      },
      children: [
        {
          id: "booking-1",
          total_paid_zar: 500,
          amount_paid_cents: 0,
          display_earnings_cents: 25_000,
          cleaner_payout_cents: 20_000,
        },
      ],
    });

    const result = await markMonthlyInvoicePaidManual(admin as never, {
      invoiceId: "invoice-zoho",
      adminEmail: "ops@example.com",
      adminUserId: "admin-1",
    });

    expect(result).toEqual({ ok: true });
    expect(resolveZohoCustomerContactForMonthlyInvoice).toHaveBeenCalledWith(expect.anything(), {
      invoiceId: "invoice-zoho",
      customerId: "cust-1",
    });
    expect(markZohoInvoicePaid).toHaveBeenCalledWith({
      zohoInvoiceId: "zoho-inv-1",
      amountZar: 500,
      paymentDate: "2026-07-11",
      reference: "manual:monthly_invoice:invoice-zoho",
      customerEmail: "customer@example.com",
      customerName: "Customer",
    });
  });

  it("still succeeds when Zoho mark-paid fails", async () => {
    process.env.ZOHO_CLIENT_ID = "client";
    process.env.ZOHO_REFRESH_TOKEN = "refresh";
    markZohoInvoicePaid.mockResolvedValueOnce({ ok: false, error: "zoho_down" });

    const { admin } = buildAdmin({
      invoice: {
        id: "invoice-zoho-fail",
        status: "sent",
        total_amount_cents: 50_000,
        amount_paid_cents: 0,
        is_closed: false,
        zoho_invoice_id: "zoho-inv-2",
        customer_id: "cust-1",
      },
      children: [],
    });

    const result = await markMonthlyInvoicePaidManual(admin as never, {
      invoiceId: "invoice-zoho-fail",
      adminEmail: "ops@example.com",
      adminUserId: "admin-1",
    });

    expect(result).toEqual({ ok: true });
    expect(markZohoInvoicePaid).toHaveBeenCalled();
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
    expect(captured.paymentTransactions).toHaveLength(1);
    expect(captured.invoiceUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(captured.bookingUpdates.map((u) => u.bookingId)).toEqual(["booking-1", "booking-2"]);
    expect(markZohoInvoicePaid).not.toHaveBeenCalled();
  });
});
