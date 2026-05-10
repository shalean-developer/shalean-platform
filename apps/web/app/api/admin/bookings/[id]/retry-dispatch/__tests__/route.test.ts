import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userEmail: "user@example.com",
}));

const { getSupabaseAdminMock, retryDispatchBookingMock } = vi.hoisted(() => ({
  getSupabaseAdminMock: vi.fn(),
  retryDispatchBookingMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    retryDispatchBooking: (...args: Parameters<typeof mod.retryDispatchBooking>) => retryDispatchBookingMock(...args),
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

import { POST } from "../route";

describe("POST /api/admin/bookings/[id]/retry-dispatch", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
    authState.userEmail = "user@example.com";
    getSupabaseAdminMock.mockReset();
    retryDispatchBookingMock.mockReset();
  });

  it("returns 401 without authorization", async () => {
    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(403);
  });

  it("calls retryDispatchBooking and returns unchanged success JSON", async () => {
    authState.userEmail = "ops@example.com";
    const bookingId = "00000000-0000-4000-8000-000000000002";
    const adminStub = { tag: "admin" };
    getSupabaseAdminMock.mockReturnValue(adminStub as never);
    retryDispatchBookingMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, assignmentKind: "team", teamId: "00000000-0000-4000-8000-0000000000aa" },
      event: { type: "booking.assigned", bookingId, actor: "admin", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
      { params: Promise.resolve({ id: bookingId }) },
    );

    expect(res.status).toBe(200);
    expect(retryDispatchBookingMock).toHaveBeenCalledWith({
      admin: adminStub,
      bookingId,
      actorUserId: "00000000-0000-4000-8000-000000000099",
      actorEmail: "ops@example.com",
    });
    expect(await res.json()).toEqual({
      ok: true,
      assignmentKind: "team",
      teamId: "00000000-0000-4000-8000-0000000000aa",
    });
  });

  it("replays failure body and status from bookingOperations cause", async () => {
    authState.userEmail = "ops@example.com";
    getSupabaseAdminMock.mockReturnValue({} as never);
    retryDispatchBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "00000000-0000-4000-8000-000000000002",
      code: "retry_dispatch_http_422",
      message: "Booking must be pending and unassigned.",
      httpStatus: 422,
      cause: { status: 422, body: { error: "Booking must be pending and unassigned." } },
    });

    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { Authorization: "Bearer x" },
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Booking must be pending and unassigned." });
  });
});
