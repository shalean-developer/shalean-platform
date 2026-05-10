import { beforeEach, describe, expect, it, vi } from "vitest";

const { persistMock, fetchDisplayMock, resolvePersistMock } = vi.hoisted(() => ({
  persistMock: vi.fn(),
  fetchDisplayMock: vi.fn(),
  resolvePersistMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/payout/resetBookingCleanerLineEarnings", () => ({
  resetBookingCleanerLineEarnings: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/booking/ensureBookingLineItemsForEarnings", () => ({
  ensureBookingLineItemsForEarningsIfMissing: async () => ({ ok: true as const }),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/payout/persistCleanerPayout", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/payout/persistCleanerPayout")>();
  return { ...mod, persistCleanerPayoutIfUnset: persistMock, resolvePersistEarningsComputation: resolvePersistMock };
});

vi.mock("@/lib/payout/bookingEarningsIntegrity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/payout/bookingEarningsIntegrity")>();
  return { ...mod, fetchBookingDisplayEarningsCents: fetchDisplayMock };
});

vi.mock("@/lib/auth/admin", () => ({
  isAdmin: () => true,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

const getSupabaseAdminMock = vi.fn();
const createClientMock = vi.fn();

import { PATCH } from "../route";

const bookingId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const oldCleaner = "11111111-2222-4333-8444-555555555555";
const newCleaner = "66666666-7777-4888-8999-aaaaaaaaaaaa";

describe("PATCH /api/admin/bookings/[id] earnings recompute after cleaner reassignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePersistMock.mockResolvedValue({
      ok: true,
      earnings: {
        display_earnings_cents: 100,
        payout_earnings_cents: 100,
        internal_earnings_cents: 100,
        earnings_model_version: "v_test",
      },
      usedLineItemBasis: false,
      usedFallback: false,
      lineItemRows: [],
      payoutBaseCents: 1000,
      serviceFeeCents: 0,
      bookingDateIso: "",
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: "admin@example.com", id: "adm1" } },
        }),
      },
    });
    persistMock.mockResolvedValue({ ok: true, skipped: false });
    fetchDisplayMock.mockResolvedValue(12_500);
  });

  it("calls persistCleanerPayoutIfUnset and returns earnings_recompute ok", async () => {
    getSupabaseAdminMock.mockReturnValue({
      from(table: string) {
        if (table !== "bookings") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "unexpected table" } }) }),
            }),
          };
        }
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (cols.includes("user_id")) {
                  return {
                    data: {
                      user_id: null,
                      cleaner_id: oldCleaner,
                      status: "assigned",
                      completed_at: null,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      date: "2026-06-01",
                      time: "09:00:00",
                      selected_cleaner_id: null,
                      billing_type: "prepaid",
                      monthly_invoice_id: null,
                      is_recurring_generated: false,
                      dispatch_status: "assigned",
                      cleaner_response_status: "pending",
                      assigned_at: "2026-01-01T00:00:00.000Z",
                      en_route_at: null,
                      started_at: null,
                      display_earnings_cents: 10_000,
                      payout_earnings_cents: 10_000,
                      internal_earnings_cents: 10_000,
                      earnings_model_version: "v1",
                      earnings_percentage_applied: null,
                      earnings_cap_cents_applied: null,
                      earnings_tenure_months_at_assignment: null,
                      cleaner_earnings_total_cents: null,
                      cleaner_line_earnings_finalized_at: null,
                      cleaner_payout_cents: 100,
                      cleaner_bonus_cents: 0,
                      company_revenue_cents: 500,
                      payout_percentage: 0.6,
                      payout_type: "percentage",
                      total_paid_zar: null,
                      total_paid_cents: 50_000,
                      amount_paid_cents: 50_000,
                      base_amount_cents: 45_000,
                      service_fee_cents: 5_000,
                      payment_status: "paid",
                      booking_snapshot: {},
                      service: "Standard clean",
                      payout_id: null,
                    },
                    error: null,
                  };
                }
                if (cols.includes("display_earnings_cents") && cols.includes("team_id")) {
                  return {
                    data: {
                      cleaner_id: newCleaner,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      refunded_at: null,
                      refund_status: null,
                      display_earnings_cents: null,
                      status: "assigned",
                    },
                    error: null,
                  };
                }
                if (cols === "status") {
                  return { data: { status: "assigned" }, error: null };
                }
                return { data: null, error: { message: `unexpected select: ${cols}` } };
              },
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    } as never);

    const res = await PATCH(
      new Request(`http://localhost/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ cleaner_id: newCleaner }),
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; earnings_recompute?: { ok: boolean } };
    expect(json.ok).toBe(true);
    expect(json.earnings_recompute?.ok).toBe(true);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId,
        cleanerId: newCleaner,
        forceDisplayRecompute: true,
      }),
    );
    expect(fetchDisplayMock).toHaveBeenCalled();
  });

  it("returns earnings_recompute failure when persist returns ok false", async () => {
    persistMock.mockResolvedValue({ ok: false, error: "cap exceeded", code: "payout_exceeds_financial_cap" });
    fetchDisplayMock.mockResolvedValue(null);

    getSupabaseAdminMock.mockReturnValue({
      from(table: string) {
        if (table !== "bookings") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (cols.includes("user_id")) {
                  return {
                    data: {
                      user_id: null,
                      cleaner_id: oldCleaner,
                      status: "assigned",
                      completed_at: null,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      date: "2026-06-01",
                      time: "09:00:00",
                      selected_cleaner_id: null,
                      billing_type: null,
                      monthly_invoice_id: null,
                      is_recurring_generated: false,
                      dispatch_status: "assigned",
                      cleaner_response_status: "pending",
                      assigned_at: null,
                      en_route_at: null,
                      started_at: null,
                      display_earnings_cents: null,
                      payout_earnings_cents: null,
                      internal_earnings_cents: null,
                      earnings_model_version: null,
                      earnings_percentage_applied: null,
                      earnings_cap_cents_applied: null,
                      earnings_tenure_months_at_assignment: null,
                      cleaner_earnings_total_cents: null,
                      cleaner_line_earnings_finalized_at: null,
                      cleaner_payout_cents: null,
                      cleaner_bonus_cents: null,
                      company_revenue_cents: null,
                      payout_percentage: null,
                      payout_type: null,
                      total_paid_zar: null,
                      total_paid_cents: null,
                      amount_paid_cents: null,
                      base_amount_cents: null,
                      service_fee_cents: null,
                      payment_status: null,
                      booking_snapshot: {},
                      service: "Standard clean",
                      payout_id: null,
                    },
                    error: null,
                  };
                }
                if (cols.includes("team_id")) {
                  return {
                    data: {
                      cleaner_id: newCleaner,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      refunded_at: null,
                      refund_status: null,
                      display_earnings_cents: null,
                      status: "assigned",
                    },
                    error: null,
                  };
                }
                if (cols === "status") {
                  return { data: { status: "assigned" }, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    } as never);

    const res = await PATCH(
      new Request(`http://localhost/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ cleaner_id: newCleaner }),
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      earnings_recompute?: { ok: boolean; code?: string };
    };
    expect(json.earnings_recompute?.ok).toBe(false);
    expect(json.earnings_recompute?.code).toBe("payout_exceeds_financial_cap");
  });

  it("returns 422 when preflight cannot compute earnings for a paid solo booking", async () => {
    resolvePersistMock.mockResolvedValue({ ok: false, error: "Could not resolve earnings" });

    getSupabaseAdminMock.mockReturnValue({
      from(table: string) {
        if (table !== "bookings") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (cols.includes("user_id")) {
                  return {
                    data: {
                      user_id: "u1",
                      cleaner_id: oldCleaner,
                      status: "assigned",
                      completed_at: null,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      date: "2026-06-01",
                      time: "09:00:00",
                      selected_cleaner_id: null,
                      billing_type: "prepaid",
                      monthly_invoice_id: null,
                      is_recurring_generated: false,
                      dispatch_status: "assigned",
                      cleaner_response_status: "pending",
                      assigned_at: null,
                      en_route_at: null,
                      started_at: null,
                      display_earnings_cents: 5000,
                      payout_earnings_cents: 5000,
                      internal_earnings_cents: 5000,
                      earnings_model_version: "v1",
                      earnings_percentage_applied: null,
                      earnings_cap_cents_applied: null,
                      earnings_tenure_months_at_assignment: null,
                      cleaner_earnings_total_cents: null,
                      cleaner_line_earnings_finalized_at: null,
                      cleaner_payout_cents: 50,
                      cleaner_bonus_cents: 0,
                      company_revenue_cents: 200,
                      payout_percentage: 0.6,
                      payout_type: "percentage",
                      total_paid_zar: null,
                      total_paid_cents: 10_000,
                      amount_paid_cents: 10_000,
                      base_amount_cents: 9000,
                      service_fee_cents: 1000,
                      payment_status: "paid",
                      booking_snapshot: {},
                      service: "Standard clean",
                      payout_id: null,
                    },
                    error: null,
                  };
                }
                if (cols.includes("display_earnings_cents") && cols.includes("team_id")) {
                  return {
                    data: {
                      id: bookingId,
                      status: "assigned",
                      cleaner_id: oldCleaner,
                      payout_owner_cleaner_id: null,
                      is_team_job: false,
                      team_id: null,
                      base_amount_cents: 9000,
                      service_fee_cents: 1000,
                      total_paid_zar: null,
                      total_paid_cents: 10_000,
                      amount_paid_cents: 10_000,
                      service: "Standard clean",
                      booking_snapshot: {},
                      date: "2026-06-01",
                      time: "09:00:00",
                      cleaner_payout_cents: null,
                      billing_type: "prepaid",
                      is_monthly_billing_booking: false,
                      monthly_invoice_id: null,
                      payment_status: "paid",
                      payout_id: null,
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    } as never);

    const res = await PATCH(
      new Request(`http://localhost/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ cleaner_id: newCleaner }),
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("earnings_basis_uncomputable");
    expect(persistMock).not.toHaveBeenCalled();
  });
});
