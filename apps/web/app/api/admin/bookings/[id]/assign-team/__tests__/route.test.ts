import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userEmail: "user@example.com",
}));

const { adminAssignTeamToBookingMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  adminAssignTeamToBookingMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    adminAssignTeamToBooking: (...args: Parameters<typeof mod.adminAssignTeamToBooking>) =>
      adminAssignTeamToBookingMock(...args),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: { id: "00000000-0000-4000-8000-000000000099", email: authState.userEmail },
        },
        error: null,
      })),
    },
  })),
}));

import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import { GET, POST } from "../route";

describe("POST /api/admin/bookings/[id]/assign-team", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
    authState.userEmail = "user@example.com";
    getSupabaseAdminMock.mockReset();
    adminAssignTeamToBookingMock.mockReset();
  });

  it("returns 401 without authorization", async () => {
    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-000000000001" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when bearer token present but user is not admin", async () => {
    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-000000000001" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(403);
  });

  it("calls adminAssignTeamToBooking and returns unchanged success JSON", async () => {
    authState.userEmail = "ops@example.com";
    const bookingId = "00000000-0000-4000-8000-000000000002";
    const teamId = "00000000-0000-4000-8000-0000000000aa";
    const adminStub = { tag: "admin-client" };
    getSupabaseAdminMock.mockReturnValue(adminStub as never);

    adminAssignTeamToBookingMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, teamId, oldTeamId: "00000000-0000-4000-8000-0000000000bb" },
      event: {
        type: "booking.assigned",
        bookingId,
        actor: "admin",
        occurredAt: "2026-01-01T00:00:00.000Z",
        idempotencyKey: "k",
      },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId }),
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(200);
    expect(adminAssignTeamToBookingMock).toHaveBeenCalledTimes(1);
    expect(adminAssignTeamToBookingMock).toHaveBeenCalledWith({
      admin: adminStub,
      bookingId,
      teamId,
      adminUserId: "00000000-0000-4000-8000-000000000099",
      adminEmail: "ops@example.com",
      force: false,
    });
    const json = (await res.json()) as { ok: boolean; teamId: string; oldTeamId: string | null };
    expect(json).toEqual({
      ok: true,
      teamId,
      oldTeamId: "00000000-0000-4000-8000-0000000000bb",
    });
  });

  it("passes force:true through to adminAssignTeamToBooking", async () => {
    authState.userEmail = "ops@example.com";
    const bookingId = "00000000-0000-4000-8000-000000000002";
    const teamId = "00000000-0000-4000-8000-0000000000aa";
    getSupabaseAdminMock.mockReturnValue({} as never);
    adminAssignTeamToBookingMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, teamId, oldTeamId: null, forceReopenedEarnings: true },
      event: {
        type: "booking.assigned",
        bookingId,
        actor: "admin",
        occurredAt: "2026-01-01T00:00:00.000Z",
        idempotencyKey: "k",
      },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId, force: true }),
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(200);
    expect(adminAssignTeamToBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId, teamId, force: true }),
    );
    const json = (await res.json()) as { forceReopenedEarnings?: boolean };
    expect(json.forceReopenedEarnings).toBe(true);
  });

  it("maps bookingOperations failure to same JSON shape and status as before (performAdminAssignTeam errors)", async () => {
    authState.userEmail = "ops@example.com";
    getSupabaseAdminMock.mockReturnValue({} as never);
    adminAssignTeamToBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "00000000-0000-4000-8000-000000000002",
      code: "admin_assign_team_http_409",
      message: BOOKING_ROSTER_LOCKED_HINT,
      httpStatus: 409,
      cause: { ok: false, httpStatus: 409, error: BOOKING_ROSTER_LOCKED_HINT, code: "roster_finalized" },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-0000000000aa" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; hint?: string; force_hint?: string; code?: string };
    expect(json.error).toBe(BOOKING_ROSTER_LOCKED_HINT);
    expect(json.hint).toBe(BOOKING_ROSTER_LOCKED_HINT);
    expect(json.code).toBe("roster_finalized");
    expect(json.force_hint).toMatch(/Force assign/i);
  });

  it("does not attach roster-locked hint for capacity 409s", async () => {
    authState.userEmail = "ops@example.com";
    getSupabaseAdminMock.mockReturnValue({} as never);
    adminAssignTeamToBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "00000000-0000-4000-8000-000000000002",
      code: "admin_assign_team_http_409",
      message: "Team is at capacity for this booking date.",
      httpStatus: 409,
      cause: { ok: false, httpStatus: 409, error: "Team is at capacity for this booking date." },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-0000000000aa" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string; hint?: string };
    expect(json.error).toBe("Team is at capacity for this booking date.");
    expect(json.hint).toBeUndefined();
  });
});

describe("GET /api/admin/bookings/[id]/assign-team", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
    authState.userEmail = "user@example.com";
  });

  it("returns 401 without authorization", async () => {
    const res = await GET(new Request("http://localhost/test"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }),
    });
    expect(res.status).toBe(401);
  });
});
