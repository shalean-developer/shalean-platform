import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getSupabaseAdminMock, adminMarkBookingPaidOperationMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  adminMarkBookingPaidOperationMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/admin", () => ({
  isAdmin: () => true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", () => ({
  adminMarkBookingPaidOperation: (...args: unknown[]) => adminMarkBookingPaidOperationMock(...args),
}));

import { POST } from "../mark-paid/route";

const bookingId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

type GuardRow = {
  monthly_invoice_id?: string | null;
  payment_status?: string | null;
  is_monthly_billing_booking?: boolean | null;
  billing_type?: string | null;
};

function installAdmin(row: GuardRow | null) {
  getSupabaseAdminMock.mockReturnValue({
    from(table: string) {
      expect(table).toBe("bookings");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      };
    },
  });
}

async function postMarkPaid(body: Record<string, unknown> = {}) {
  return POST(
    new Request(`http://localhost/api/admin/bookings/${bookingId}/mark-paid`, {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ method: "cash", ...body }),
    }),
    { params: Promise.resolve({ id: bookingId }) },
  );
}

describe("POST /api/admin/bookings/[id]/mark-paid monthly child guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "admin-1", email: "admin@example.com" } },
        }),
      },
    });
    adminMarkBookingPaidOperationMock.mockResolvedValue({
      ok: true,
      data: {
        variant: "full_settled",
        settlement: {
          amount_cents: 50_000,
          total_paid_zar: 500,
          method: "cash",
          payment_reference_external: null,
          paystack_reference: "cash_b",
          preserved_paystack_reference: "pay_b",
        },
      },
    });
  });

  it("allows a normal one-off unpaid booking to be marked paid", async () => {
    installAdmin({
      monthly_invoice_id: null,
      payment_status: "pending",
      is_monthly_billing_booking: false,
      billing_type: "prepaid",
    });

    const res = await postMarkPaid();
    const json = (await res.json()) as { ok?: boolean; marked_paid?: boolean };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, marked_paid: true });
    expect(adminMarkBookingPaidOperationMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["monthly invoice child", { monthly_invoice_id: "invoice-1" }, "monthly_invoice_id"],
    ["pending_monthly child", { payment_status: "pending_monthly" }, "payment_status_pending_monthly"],
    ["monthly billing booking", { is_monthly_billing_booking: true }, "is_monthly_billing_booking"],
    ["billing_type monthly", { billing_type: "monthly" }, "billing_type_monthly"],
  ])("blocks %s", async (_label, overrides, expectedIndicator) => {
    installAdmin({
      monthly_invoice_id: null,
      payment_status: "pending",
      is_monthly_billing_booking: false,
      billing_type: "prepaid",
      ...overrides,
    });

    const res = await postMarkPaid();
    const json = (await res.json()) as {
      ok?: boolean;
      code?: string;
      error?: string;
      indicators?: string[];
      domain?: string;
      severity?: string;
      action?: string;
      blocking?: boolean;
      warnings?: Array<{ code: string; domain: string; severity: string; action: string; blocking: boolean }>;
    };

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.code).toBe("admin_mark_paid_monthly_invoice_child_blocked");
    expect(json.error).toContain("monthly invoice payment flow");
    expect(json.indicators).toContain(expectedIndicator);
    expect(json.domain).toBe("payment");
    expect(json.severity).toBe("critical");
    expect(json.action).toBe("blocked");
    expect(json.blocking).toBe(true);
    expect(json.warnings?.[0]).toMatchObject({
      code: "admin.payment.monthly_child_mark_paid_blocked",
      domain: "payment",
      severity: "critical",
      action: "blocked",
      blocking: true,
    });
    expect(adminMarkBookingPaidOperationMock).not.toHaveBeenCalled();
  });
});
