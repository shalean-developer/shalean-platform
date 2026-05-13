import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { settleMonthlyInvoiceChildrenMock, logSystemEventMock } = vi.hoisted(() => ({
  settleMonthlyInvoiceChildrenMock: vi.fn(),
  logSystemEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/monthlyInvoice/settleMonthlyInvoiceChildren", () => ({
  settleMonthlyInvoiceChildren: settleMonthlyInvoiceChildrenMock,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: logSystemEventMock,
}));

import { repairPaidMonthlyInvoiceChildSettlementDrift } from "@/lib/monthlyInvoice/repairPaidMonthlyInvoiceChildSettlementDrift";

type Row = Record<string, unknown>;

function booking(overrides: Row = {}): Row {
  return {
    id: "booking-1",
    monthly_invoice_id: "invoice-1",
    status: "completed",
    payment_status: "pending_monthly",
    payout_status: null,
    payout_frozen_cents: null,
    total_paid_zar: 800,
    amount_paid_cents: 0,
    display_earnings_cents: 25_000,
    cleaner_payout_cents: 20_000,
    refund_status: null,
    refunded_at: null,
    is_team_job: false,
    team_id: null,
    ...overrides,
  };
}

function buildAdmin(opts: { bookings: Row[]; invoices: Row[] }) {
  const captured = {
    bookingLimit: 0,
    invoiceIds: [] as string[],
    invoiceUpdates: [] as Row[],
  };

  const admin = {
    from(table: string) {
      if (table === "bookings") {
        const chain = {
          select: () => chain,
          not: () => chain,
          order: () => chain,
          limit: async (n: number) => {
            captured.bookingLimit = n;
            return { data: opts.bookings.slice(0, n), error: null };
          },
          update: (patch: Row) => {
            captured.invoiceUpdates.push(patch);
            return chain;
          },
        };
        return chain;
      }
      if (table === "monthly_invoices") {
        const chain = {
          select: () => chain,
          in: async (_col: string, ids: string[]) => {
            captured.invoiceIds = ids;
            return { data: opts.invoices.filter((r) => ids.includes(String(r.id))), error: null };
          },
          update: (patch: Row) => {
            captured.invoiceUpdates.push(patch);
            return chain;
          },
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { admin, captured };
}

describe("repairPaidMonthlyInvoiceChildSettlementDrift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settleMonthlyInvoiceChildrenMock.mockResolvedValue({
      ok: true,
      invoiceId: "invoice-1",
      attempted: 1,
      settled: 1,
      failed: 0,
      failures: [],
    });
  });

  it("auto-repairs paid invoice children with positive earnings basis", async () => {
    const { admin } = buildAdmin({
      bookings: [booking()],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      candidates_scanned: 1,
      children_matched: 1,
      invoices_matched: 1,
      repaired: 1,
      failed: 0,
      skipped_manual_review: 0,
    });
    expect(settleMonthlyInvoiceChildrenMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        invoiceId: "invoice-1",
        source: "monthly_invoice/repair_child_settlement_drift",
        reference: "repair",
        children: [expect.objectContaining({ id: "booking-1" })],
      }),
    );
  });

  it("skips missing earnings basis for manual review", async () => {
    const { admin } = buildAdmin({
      bookings: [booking({ display_earnings_cents: null, cleaner_payout_cents: null })],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 0,
      repaired: 0,
      skipped_manual_review: 1,
      skipped: expect.objectContaining({ missing_earnings_basis: 1 }),
    });
    expect(settleMonthlyInvoiceChildrenMock).not.toHaveBeenCalled();
  });

  it("skips unpaid invoices", async () => {
    const { admin } = buildAdmin({
      bookings: [booking()],
      invoices: [{ id: "invoice-1", status: "sent" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 0,
      repaired: 0,
      skipped: expect.objectContaining({ invoice_not_paid: 1 }),
    });
    expect(settleMonthlyInvoiceChildrenMock).not.toHaveBeenCalled();
  });

  it("skips cancelled children", async () => {
    const { admin } = buildAdmin({
      bookings: [booking({ status: "cancelled" })],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 0,
      repaired: 0,
      skipped_manual_review: 1,
      skipped: expect.objectContaining({ child_cancelled: 1 }),
    });
    expect(settleMonthlyInvoiceChildrenMock).not.toHaveBeenCalled();
  });

  it("is idempotent for already-settled children", async () => {
    const { admin } = buildAdmin({
      bookings: [
        booking({
          payment_status: "success",
          payout_status: "eligible",
          payout_frozen_cents: 25_000,
        }),
      ],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 0,
      repaired: 0,
      skipped: expect.objectContaining({ already_settled: 1 }),
    });
    expect(settleMonthlyInvoiceChildrenMock).not.toHaveBeenCalled();
  });

  it("aggregates partial repair failures", async () => {
    settleMonthlyInvoiceChildrenMock.mockResolvedValueOnce({
      ok: false,
      invoiceId: "invoice-1",
      attempted: 2,
      settled: 1,
      failed: 1,
      failures: [{ bookingId: "booking-2", error: "db failed" }],
      error: "monthly_invoice_child_settlement_partial:invoice-1:settled=1:failed=1",
    });
    const { admin } = buildAdmin({
      bookings: [booking({ id: "booking-1" }), booking({ id: "booking-2" })],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 2,
      invoices_matched: 1,
      repaired: 1,
      failed: 1,
      failures: [{ invoiceId: "invoice-1", bookingId: "booking-2", error: "db failed" }],
    });
  });

  it("honors repairLimit after scanning", async () => {
    const { admin } = buildAdmin({
      bookings: [booking({ id: "booking-1" }), booking({ id: "booking-2" })],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never, {
      repairLimit: 1,
      scanLimit: 2,
    });

    expect(result).toMatchObject({ ok: true, candidates_scanned: 2, children_matched: 1 });
    expect(settleMonthlyInvoiceChildrenMock).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ children: [expect.objectContaining({ id: "booking-1" })] }),
    );
  });

  it("skips uncertain team payout integrity and refund/dispute blocked children", async () => {
    const { admin } = buildAdmin({
      bookings: [
        booking({ id: "team", is_team_job: true }),
        booking({ id: "refund", refund_status: "refunded" }),
      ],
      invoices: [{ id: "invoice-1", status: "paid" }],
    });

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin as never);

    expect(result).toMatchObject({
      ok: true,
      children_matched: 0,
      skipped_manual_review: 2,
      skipped: expect.objectContaining({
        uncertain_team_payout_integrity: 1,
        refund_or_dispute_blocked: 1,
      }),
    });
    expect(settleMonthlyInvoiceChildrenMock).not.toHaveBeenCalled();
  });

  it("uses settlement helper and does not mutate invoice totals or status directly", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/monthlyInvoice/repairPaidMonthlyInvoiceChildSettlementDrift.ts"),
      "utf8",
    );
    expect(src).toContain("settleMonthlyInvoiceChildren");
    expect(src).not.toMatch(/from\("monthly_invoices"\)[\s\S]*?\.update\(/);
    expect(src).not.toMatch(/total_amount_cents:\s*/);
    expect(src).not.toMatch(/status:\s*"paid"/);
  });
});
