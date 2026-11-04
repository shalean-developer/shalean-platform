import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
  initializePaystack: vi.fn(),
  reminderEmail: vi.fn(),
  whatsapp: vi.fn(),
  reportIssue: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock("@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice", () => ({
  initializePaystackForMonthlyInvoice: mocks.initializePaystack,
}));
vi.mock("@/lib/monthlyInvoice/sendMonthlyInvoiceEmail", () => ({
  sendMonthlyInvoiceReminderEmail: mocks.reminderEmail,
}));
vi.mock("@/lib/dispatch/metaWhatsAppSend", () => ({
  sendViaMetaWhatsApp: mocks.whatsapp,
}));
vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: mocks.reportIssue,
  logSystemEvent: mocks.logEvent,
}));

import { loadPayMonthlyInvoiceLanding } from "@/lib/pay/loadPayMonthlyInvoiceLanding";
import { runSendInvoiceReminders } from "@/lib/monthlyInvoice/runSendInvoiceReminders";

const invoiceId = "11111111-2222-4333-8444-555555551049";
const reference = "mi_voided_fixture";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initializePaystack.mockImplementation(() => {
    throw new Error("UNEXPECTED_PAYSTACK_INITIALIZATION");
  });
  mocks.reminderEmail.mockImplementation(() => {
    throw new Error("UNEXPECTED_EMAIL_DELIVERY");
  });
  mocks.whatsapp.mockImplementation(() => {
    throw new Error("UNEXPECTED_WHATSAPP_DELIVERY");
  });
});

describe("PR1049 voided invoice negative-path isolation", () => {
  it.each([
    { status: "void", is_closed: true },
    { status: "void", is_closed: false },
    { status: "sent", is_closed: true },
  ])("returns HTTP 410 before Paystack for invoice %j", async (state) => {
    const queries: Array<[string, unknown]> = [];
    const writes = vi.fn();
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((column: string, value: unknown) => {
        queries.push([column, value]);
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: invoiceId,
          customer_id: "fixture-customer",
          month: "2099-12",
          paystack_reference: reference,
          payment_link: null,
          balance_cents: 36000,
          ...state,
        },
        error: null,
      })),
    };
    const from = vi.fn(() => chain);
    mocks.getSupabaseAdmin.mockReturnValue({ from, update: writes });
    const result = await loadPayMonthlyInvoiceLanding(invoiceId, reference);
    expect(result).toMatchObject({ ok: false, httpStatus: 410 });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("monthly_invoices");
    expect(queries).toContainEqual(["id", invoiceId]);
    expect(mocks.initializePaystack).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it("excludes a voided R360 invoice from reminder selection without any sends or writes", async () => {
    const predicates: Array<[string, string, unknown]> = [];
    const write = vi.fn();
    const chain = {
      select: vi.fn(() => chain),
      gt: vi.fn((column: string, value: unknown) => {
        predicates.push(["gt", column, value]); return chain;
      }),
      in: vi.fn((column: string, value: unknown) => {
        predicates.push(["in", column, value]); return chain;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        predicates.push(["eq", column, value]); return chain;
      }),
      then: (resolve: (value: unknown) => void) => {
        // Represents the DB executing the observed query filters: void/closed does not match.
        const selectsOnlyCollectible =
          predicates.some(([op, column, value]) => op === "gt" && column === "balance_cents" && value === 0) &&
          predicates.some(([op, column, value]) => op === "eq" && column === "is_closed" && value === false) &&
          predicates.some(([op, column, value]) => op === "in" && column === "status" &&
            Array.isArray(value) && !value.includes("void"));
        resolve({ data: selectsOnlyCollectible ? [] : [{ id: invoiceId, status: "void", is_closed: true, balance_cents: 36000 }], error: null });
      },
    };
    const from = vi.fn(() => chain);
    const result = await runSendInvoiceReminders({ from, update: write, rpc: write } as never);
    expect(result).toMatchObject({ ok: true, total_checked: 0, total_sent: 0, total_failed: 0 });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("monthly_invoices");
    expect(mocks.reminderEmail).not.toHaveBeenCalled();
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.initializePaystack).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
