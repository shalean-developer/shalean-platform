import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseAdminMock, requireAdminSessionMock, deleteCalls } = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  requireAdminSessionMock: vi.fn(),
  deleteCalls: [] as string[],
}));

vi.mock("@/lib/admin/requireAdminSession", () => ({
  requireAdminSession: (...args: unknown[]) => requireAdminSessionMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/admin/cleanerAvailabilityCache", () => ({
  invalidateCleanerAvailabilityCache: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from "../route";

const bookingId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

type BookingRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  paid_at?: string | null;
  monthly_invoice_id?: string | null;
  payout_id?: string | null;
  payout_status?: string | null;
  payout_frozen_cents?: number | null;
  display_earnings_cents?: number | null;
  amount_paid_cents?: number | null;
  cleaner_id?: string | null;
  date?: string | null;
  time?: string | null;
};

function safeBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: bookingId,
    status: "pending",
    payment_status: null,
    payment_completed_at: null,
    paid_at: null,
    monthly_invoice_id: null,
    payout_id: null,
    payout_status: null,
    payout_frozen_cents: null,
    display_earnings_cents: null,
    amount_paid_cents: null,
    cleaner_id: null,
    date: "2026-06-01",
    time: "09:00:00",
    ...overrides,
  };
}

function installAdmin(row: BookingRow) {
  getSupabaseAdminMock.mockReturnValue({
    from(table: string) {
      expect(table).toBe("bookings");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
        delete: () => ({
          eq: async (_column: string, value: string) => {
            deleteCalls.push(value);
            return { error: null };
          },
        }),
      };
    },
  });
}

async function callDelete() {
  return DELETE(new Request(`http://localhost/api/admin/bookings/${bookingId}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: bookingId }),
  });
}

describe("DELETE /api/admin/bookings/[id] financial hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls.length = 0;
    requireAdminSessionMock.mockResolvedValue({
      ok: true,
      user: { id: "admin-1", email: "admin@example.com" },
    });
  });

  it("allows an unpaid pending operational booking to be deleted", async () => {
    installAdmin(safeBooking());

    const res = await callDelete();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteCalls).toEqual([bookingId]);
  });

  it.each([
    ["payment_completed_at", safeBooking({ payment_completed_at: "2026-06-01T10:00:00.000Z" }), "admin_booking_delete_payment_completed"],
    ["paid payment_status", safeBooking({ payment_status: "paid" }), "admin_booking_delete_paid_payment_status"],
    ["completed status", safeBooking({ status: "completed" }), "admin_booking_delete_completed_status"],
    ["monthly invoice child", safeBooking({ monthly_invoice_id: "invoice-1" }), "admin_booking_delete_monthly_invoice_child"],
    ["payout-linked booking", safeBooking({ payout_id: "payout-1" }), "admin_booking_delete_payout_linked"],
    ["payout frozen booking", safeBooking({ payout_frozen_cents: 12_500 }), "admin_booking_delete_payout_frozen"],
    ["display earnings booking", safeBooking({ display_earnings_cents: 12_500 }), "admin_booking_delete_display_earnings_present"],
    [
      "recurring/monthly settled booking",
      safeBooking({ payment_status: "success", payout_status: "eligible", payout_frozen_cents: 12_500, amount_paid_cents: 50_000 }),
      "admin_booking_delete_paid_payment_status",
    ],
  ])("blocks %s", async (_label, row, expectedCode) => {
    installAdmin(row);

    const res = await callDelete();
    const json = (await res.json()) as {
      code?: string;
      blocks?: Array<{ code: string }>;
      domain?: string;
      severity?: string;
      action?: string;
      blocking?: boolean;
      warnings?: Array<{ code: string; domain: string; severity: string; action: string; blocking: boolean }>;
    };

    expect(res.status).toBe(409);
    expect(json.code).toBe(expectedCode);
    expect(json.blocks?.map((b) => b.code)).toContain(expectedCode);
    expect(json.domain).toBe("delete");
    expect(json.severity).toBe("critical");
    expect(json.action).toBe("blocked");
    expect(json.blocking).toBe(true);
    expect(json.warnings?.[0]).toMatchObject({
      code: "admin.delete.financial_booking_blocked",
      domain: "delete",
      severity: "critical",
      action: "blocked",
      blocking: true,
    });
    expect(deleteCalls).toEqual([]);
  });

  it("blocks payout_status eligible/approved/processing/paid even without payout_id", async () => {
    for (const payoutStatus of ["eligible", "approved", "processing", "paid"]) {
      deleteCalls.length = 0;
      installAdmin(safeBooking({ payout_status: payoutStatus }));

      const res = await callDelete();
      const json = (await res.json()) as { code?: string; blocking?: boolean; warnings?: Array<{ code: string }> };

      expect(res.status).toBe(409);
      expect(json.code).toBe("admin_booking_delete_payout_status_locked");
      expect(json.blocking).toBe(true);
      expect(json.warnings?.[0]?.code).toBe("admin.delete.financial_booking_blocked");
      expect(deleteCalls).toEqual([]);
    }
  });
});
