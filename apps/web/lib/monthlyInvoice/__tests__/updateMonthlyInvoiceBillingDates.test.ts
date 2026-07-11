import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

const updateZohoInvoiceDates = vi.fn().mockResolvedValue({ ok: true, zohoInvoiceId: "z1" });

vi.mock("@/lib/zoho/zohoBooksService", () => ({
  updateZohoInvoiceDates: (...args: unknown[]) => updateZohoInvoiceDates(...args),
}));

vi.mock("@/lib/monthlyInvoice/monthlyInvoiceLateFeePolicy", () => ({
  isMonthlyInvoiceOverdueWithGrace: vi.fn().mockReturnValue(false),
}));

import { updateMonthlyInvoiceBillingDates } from "@/lib/monthlyInvoice/updateMonthlyInvoiceBillingDates";

function buildAdmin(invoice: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      if (table !== "monthly_invoices") throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: invoice, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };
  return { admin, updates };
}

describe("updateMonthlyInvoiceBillingDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ZOHO_CLIENT_ID = "c";
    process.env.ZOHO_REFRESH_TOKEN = "r";
  });

  it("updates due and invoice dates on a paid invoice and syncs Zoho", async () => {
    const { admin, updates } = buildAdmin({
      id: "inv-1",
      month: "2026-07",
      status: "paid",
      is_closed: false,
      due_date: "2026-07-01",
      invoice_date: null,
      zoho_invoice_id: "zoho-1",
      total_amount_cents: 50_000,
      amount_paid_cents: 50_000,
      balance_cents: 0,
    });

    const result = await updateMonthlyInvoiceBillingDates(admin as never, {
      invoiceId: "inv-1",
      dueDate: "2026-07-10",
      invoiceDate: "2026-07-10",
      adminEmail: "ops@example.com",
    });

    expect(result).toMatchObject({
      ok: true,
      dueDate: "2026-07-10",
      invoiceDate: "2026-07-10",
      zohoSynced: true,
    });
    expect(updates[0]).toMatchObject({
      due_date: "2026-07-10",
      invoice_date: "2026-07-10",
      is_overdue: false,
    });
    expect(updateZohoInvoiceDates).toHaveBeenCalledWith({
      zohoInvoiceId: "zoho-1",
      invoiceDate: "2026-07-10",
      dueDate: "2026-07-10",
    });
  });

  it("rejects draft due dates outside the billing month", async () => {
    const { admin } = buildAdmin({
      id: "inv-2",
      month: "2026-07",
      status: "draft",
      is_closed: false,
      due_date: "2026-07-31",
      invoice_date: null,
      zoho_invoice_id: null,
      total_amount_cents: 10_000,
      amount_paid_cents: 0,
      balance_cents: 10_000,
    });

    const result = await updateMonthlyInvoiceBillingDates(admin as never, {
      invoiceId: "inv-2",
      dueDate: "2026-08-10",
    });

    expect(result).toEqual({ ok: false, error: "due_date_must_be_in_billing_month" });
  });

  it("rejects closed invoices", async () => {
    const { admin } = buildAdmin({
      id: "inv-3",
      month: "2026-07",
      status: "paid",
      is_closed: true,
      due_date: "2026-07-01",
      invoice_date: null,
      zoho_invoice_id: null,
      total_amount_cents: 10_000,
      amount_paid_cents: 10_000,
      balance_cents: 0,
    });

    const result = await updateMonthlyInvoiceBillingDates(admin as never, {
      invoiceId: "inv-3",
      dueDate: "2026-07-10",
    });

    expect(result).toEqual({ ok: false, error: "invoice_already_closed" });
  });
});
