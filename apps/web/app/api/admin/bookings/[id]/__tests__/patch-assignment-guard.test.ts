import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, getSupabaseAdminMock, updateCalls } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  updateCalls: [] as Array<Record<string, unknown>>,
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

vi.mock("@/lib/admin/cleanerAvailabilityCache", () => ({
  invalidateCleanerAvailabilityCache: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/payout/resetBookingCleanerLineEarnings", () => ({
  resetBookingCleanerLineEarnings: vi.fn().mockResolvedValue({ ok: true }),
}));

import { PATCH } from "../route";

const bookingId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";

function installPatchAdmin() {
  getSupabaseAdminMock.mockReturnValue({
    from(table: string) {
      expect(table).toBe("bookings");
      return {
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              if (cols === "status") return { data: { status: "pending" }, error: null };
              if (cols.includes("display_earnings_cents") && cols.includes("is_team_job")) {
                return {
                  data: {
                    status: "pending",
                    display_earnings_cents: null,
                    cleaner_id: null,
                    payout_owner_cleaner_id: null,
                    is_team_job: false,
                  },
                  error: null,
                };
              }
              return {
                data: {
                  cleaner_id: null,
                  status: "pending",
                  completed_at: null,
                  dispatch_status: "searching",
                  payout_owner_cleaner_id: null,
                  is_team_job: false,
                  date: "2026-06-01",
                  time: "09:00:00",
                  selected_cleaner_id: null,
                },
                error: null,
              };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updateCalls.push(patch);
            return { error: null };
          },
        }),
      };
    },
  });
}

async function patchBooking(body: Record<string, unknown>) {
  return PATCH(
    new Request(`http://localhost/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: bookingId }) },
  );
}

describe("PATCH /api/admin/bookings/[id] assignment field guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "admin-1", email: "admin@example.com" } },
        }),
      },
    });
  });

  it("still allows a normal non-assignment admin PATCH", async () => {
    installPatchAdmin();

    const res = await patchBooking({ date: "2026-06-02" });
    const json = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updateCalls).toEqual([{ date: "2026-06-02" }]);
  });

  it.each([
    ["cleaner_id", { cleaner_id: "11111111-2222-4333-8444-555555555555" }],
    ["selected_cleaner_id", { selected_cleaner_id: "11111111-2222-4333-8444-555555555555" }],
    ["payout_owner_cleaner_id", { payout_owner_cleaner_id: "11111111-2222-4333-8444-555555555555" }],
    ["assignment_type", { assignment_type: "manual" }],
    ["assigned_at", { assigned_at: "2026-06-01T09:00:00.000Z" }],
    ["accepted_at", { accepted_at: "2026-06-01T09:05:00.000Z" }],
  ])("blocks generic PATCH assignment field %s", async (field, body) => {
    const res = await patchBooking(body);
    const json = (await res.json()) as {
      code?: string;
      blocked_fields?: string[];
      error?: string;
      domain?: string;
      severity?: string;
      action?: string;
      blocking?: boolean;
      warnings?: Array<{ code: string; domain: string; severity: string; action: string; blocking: boolean; fields?: string[] }>;
    };

    expect(res.status).toBe(409);
    expect(json.code).toBe("admin_booking_patch_assignment_fields_blocked");
    expect(json.error).toContain("admin assignment flow");
    expect(json.blocked_fields).toEqual([field]);
    expect(json.domain).toBe("assignment");
    expect(json.severity).toBe("high");
    expect(json.action).toBe("blocked");
    expect(json.blocking).toBe(true);
    expect(json.warnings?.[0]).toMatchObject({
      code: "admin.assignment.patch_field_blocked",
      domain: "assignment",
      severity: "high",
      action: "blocked",
      blocking: true,
      fields: [field],
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(updateCalls).toEqual([]);
  });
});
