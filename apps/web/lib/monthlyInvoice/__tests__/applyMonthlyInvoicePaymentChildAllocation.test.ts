import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/booking/bookingOperations", () => ({
  refreshRecurringBookingPaymentState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/monthlyInvoice/invoiceSnapshotEvents", () => ({
  appendMonthlyInvoiceSnapshotEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cleaner/resolveCleanerEarnings", () => ({
  resolveCleanerFrozenCentsForSettlement: vi.fn(() => 24500),
}));

import { applyMonthlyInvoicePayment } from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";

type BookingChild = {
  id: string;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_payout_cents: number | null;
};

type CapturedBookingUpdate = {
  bookingId: string;
  patch: Record<string, unknown>;
};

function buildFakeAdmin(opts: {
  invoice: {
    id: string;
    status: string;
    total_amount_cents: number;
    amount_paid_cents: number;
    balance_cents: number;
  };
  children: BookingChild[];
  failingBookingIds?: string[];
}) {
  const captured: { bookingUpdates: CapturedBookingUpdate[]; invoiceUpdates: Record<string, unknown>[]; dedupInserts: Record<string, unknown>[] } = {
    bookingUpdates: [],
    invoiceUpdates: [],
    dedupInserts: [],
  };
  const failingBookingIds = new Set(opts.failingBookingIds ?? []);

  const admin = {
    from(table: string) {
      if (table === "monthly_invoices") {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: opts.invoice, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            captured.invoiceUpdates.push(patch);
            const resolved = Promise.resolve({ error: null as null });
            return {
              eq: (_col: string, _val: string) =>
                Object.assign(resolved, {
                  in: async (_col2: string, _vals: string[]) => ({ error: null }),
                  select: async () => ({ data: [{ id: opts.invoice.id }], error: null }),
                }),
            };
          },
        };
      }
      if (table === "monthly_invoice_paystack_charge_dedup") {
        return {
          insert: async (row: Record<string, unknown>) => {
            captured.dedupInserts.push(row);
            return { error: null };
          },
          delete: () => ({
            eq: async (_col: string, _val: string) => ({ error: null }),
          }),
        };
      }
      if (table === "bookings") {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              neq: async (_col2: string, _val2: string) => ({
                data: opts.children,
                error: null,
              }),
              maybeSingle: async () => ({
                data: { payment_completed_at: null, paid_at: null, completed_at: "2026-01-01T00:00:00.000Z" },
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, val: string) => {
              captured.bookingUpdates.push({ bookingId: val, patch });
              if (failingBookingIds.has(val)) {
                return { error: { message: `booking update failed:${val}` } };
              }
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

describe("applyMonthlyInvoicePayment per-child amount_paid_cents allocation (H-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes line-derived amount_paid_cents (total_paid_zar*100) for each child when invoice is fully settled", async () => {
    const invoiceId = "00000000-0000-4000-8000-000000000010";
    const children: BookingChild[] = [
      {
        id: "11111111-1111-4000-8000-000000000001",
        total_paid_zar: 800,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
      {
        id: "11111111-1111-4000-8000-000000000002",
        total_paid_zar: 1234.5,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: invoiceId,
        status: "sent",
        total_amount_cents: 80000 + 123450,
        amount_paid_cents: 0,
        balance_cents: 80000 + 123450,
      },
      children,
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_full_settle",
      amountCents: 80000 + 123450,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("settled" in result && result.settled === "full").toBe(true);
    expect(captured.bookingUpdates).toHaveLength(2);

    const u1 = captured.bookingUpdates.find((u) => u.bookingId === children[0].id);
    const u2 = captured.bookingUpdates.find((u) => u.bookingId === children[1].id);
    expect(u1).toBeDefined();
    expect(u2).toBeDefined();

    expect(u1!.patch.payment_status).toBe("success");
    expect(u1!.patch.amount_paid_cents).toBe(80000);
    expect(u1!.patch.payout_status).toBe("eligible");
    expect(u1!.patch.payout_frozen_cents).toBe(24500);

    expect(u2!.patch.payment_status).toBe("success");
    expect(u2!.patch.amount_paid_cents).toBe(123450);
  });

  it("preserves existing non-zero amount_paid_cents when total_paid_zar is 0/null", async () => {
    const invoiceId = "00000000-0000-4000-8000-000000000020";
    const children: BookingChild[] = [
      {
        id: "22222222-2222-4000-8000-000000000001",
        total_paid_zar: 0,
        amount_paid_cents: 50000,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
      {
        id: "22222222-2222-4000-8000-000000000002",
        total_paid_zar: null,
        amount_paid_cents: 12345,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: invoiceId,
        status: "sent",
        total_amount_cents: 50000 + 12345,
        amount_paid_cents: 0,
        balance_cents: 50000 + 12345,
      },
      children,
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_fallback_existing",
      amountCents: 50000 + 12345,
    });

    expect(result.ok).toBe(true);
    expect(captured.bookingUpdates).toHaveLength(2);

    const u1 = captured.bookingUpdates.find((u) => u.bookingId === children[0].id)!;
    const u2 = captured.bookingUpdates.find((u) => u.bookingId === children[1].id)!;

    expect(u1.patch.payment_status).toBe("success");
    expect(u1.patch.amount_paid_cents).toBe(50000);
    expect(u2.patch.payment_status).toBe("success");
    expect(u2.patch.amount_paid_cents).toBe(12345);
  });

  it("never writes payment_status='success' with amount_paid_cents=0 when a positive line amount is available", async () => {
    const children: BookingChild[] = [
      {
        id: "33333333-3333-4000-8000-000000000001",
        total_paid_zar: 999.99,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: "00000000-0000-4000-8000-000000000030",
        status: "sent",
        total_amount_cents: 99999,
        amount_paid_cents: 0,
        balance_cents: 99999,
      },
      children,
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_inconsistency_guard",
      amountCents: 99999,
    });

    expect(result.ok).toBe(true);
    expect(captured.bookingUpdates).toHaveLength(1);

    const update = captured.bookingUpdates[0];
    expect(update.patch.payment_status).toBe("success");
    expect(update.patch.amount_paid_cents).not.toBe(0);
    expect(Number(update.patch.amount_paid_cents)).toBeGreaterThan(0);
  });

  it("only writes amount_paid_cents=0 when both total_paid_zar and amount_paid_cents are 0/null (genuinely zero allocation)", async () => {
    const children: BookingChild[] = [
      {
        id: "44444444-4444-4000-8000-000000000001",
        total_paid_zar: null,
        amount_paid_cents: null,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: "00000000-0000-4000-8000-000000000040",
        status: "sent",
        total_amount_cents: 100,
        amount_paid_cents: 0,
        balance_cents: 100,
      },
      children,
    });

    await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_genuine_zero",
      amountCents: 100,
    });

    expect(captured.bookingUpdates).toHaveLength(1);
    expect(captured.bookingUpdates[0].patch.amount_paid_cents).toBe(0);
    expect(captured.bookingUpdates[0].patch.payment_status).toBe("success");
  });

  it("returns a clear partial-settlement error when one child fails after the invoice is paid", async () => {
    const children: BookingChild[] = [
      {
        id: "55555555-5555-4000-8000-000000000001",
        total_paid_zar: 500,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
      {
        id: "55555555-5555-4000-8000-000000000002",
        total_paid_zar: 600,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: "00000000-0000-4000-8000-000000000050",
        status: "sent",
        total_amount_cents: 110000,
        amount_paid_cents: 0,
        balance_cents: 110000,
      },
      children,
      failingBookingIds: [children[1].id],
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_child_partial_failure",
      amountCents: 110000,
    });

    expect(result).toEqual({
      ok: false,
      error: "monthly_invoice_child_settlement_partial:00000000-0000-4000-8000-000000000050:settled=1:failed=1",
    });
    expect(captured.invoiceUpdates.some((u) => u.status === "paid")).toBe(true);
    expect(captured.bookingUpdates.map((u) => u.bookingId)).toEqual(children.map((c) => c.id));
  });

  it("on already-paid replay, verifies child settlement idempotently instead of hiding child drift", async () => {
    const children: BookingChild[] = [
      {
        id: "66666666-6666-4000-8000-000000000001",
        total_paid_zar: 700,
        amount_paid_cents: 0,
        display_earnings_cents: 24500,
        cleaner_payout_cents: 24500,
      },
    ];

    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: "00000000-0000-4000-8000-000000000060",
        status: "paid",
        total_amount_cents: 70000,
        amount_paid_cents: 70000,
        balance_cents: 0,
      },
      children,
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_h1_replay_paid_invoice",
      amountCents: 70000,
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: "already_paid" });
    expect(captured.dedupInserts).toEqual([]);
    expect(captured.bookingUpdates).toHaveLength(1);
    expect(captured.bookingUpdates[0].patch).toMatchObject({
      payment_status: "success",
      amount_paid_cents: 70000,
      payout_status: "eligible",
      payout_frozen_cents: 24500,
    });
  });

  it("quarantines when charged amount does not equal remaining balance (BILL-INV-002 C01)", async () => {
    const { admin, captured } = buildFakeAdmin({
      invoice: {
        id: "00000000-0000-4000-8000-000000000070",
        status: "sent",
        total_amount_cents: 200000,
        amount_paid_cents: 0,
        balance_cents: 200000,
      },
      children: [],
    });

    const result = await applyMonthlyInvoicePayment(admin as never, {
      reference: "tx_stale_underpay",
      amountCents: 150000,
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "amount_mismatch_quarantined",
    });
    expect(captured.dedupInserts).toEqual([]);
    expect(captured.bookingUpdates).toEqual([]);
    expect(captured.invoiceUpdates.some((u) => u.payment_link === null)).toBe(true);
  });
});
