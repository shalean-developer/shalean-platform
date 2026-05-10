import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminSmartAssignBookingMock, getSupabaseAdminMock, createClientMock } = vi.hoisted(() => ({
  adminSmartAssignBookingMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    adminSmartAssignBooking: (...args: Parameters<typeof mod.adminSmartAssignBooking>) =>
      adminSmartAssignBookingMock(...args),
  };
});

vi.mock("@/lib/auth/admin", () => ({
  isAdmin: () => true,
}));

import { POST } from "../route";

describe("POST /api/admin/bookings/[id]/assign-smart", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    adminSmartAssignBookingMock.mockReset();
    getSupabaseAdminMock.mockReset();
    createClientMock.mockReset();

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: "admin@example.com" } },
        }),
      },
    });

    getSupabaseAdminMock.mockReturnValue({ tag: "admin" } as never);
  });

  it("calls adminSmartAssignBooking and returns legacy success JSON", async () => {
    adminSmartAssignBookingMock.mockResolvedValue({
      ok: true,
      bookingId: "b-smart-1",
      data: {
        ok: true,
        cleanerId: "cl-s1",
        offerId: "offer-s1",
        expiresAt: "2026-10-01T09:00:00.000Z",
        attempts: 1,
      },
      event: { type: "booking.assigned", bookingId: "b-smart-1", actor: "admin" },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/bookings/b-smart-1/assign-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({ cleanerIds: ["cl-s1"], force: false }),
      }),
      { params: Promise.resolve({ id: "b-smart-1" }) },
    );

    expect(res.status).toBe(200);
    expect(adminSmartAssignBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: { tag: "admin" },
        bookingId: "b-smart-1",
        force: false,
        cleanerIds: ["cl-s1"],
      }),
    );
    expect(await res.json()).toEqual({
      ok: true,
      cleanerId: "cl-s1",
      offerId: "offer-s1",
      expiresAt: "2026-10-01T09:00:00.000Z",
      attempts: 1,
    });
  });

  it("returns 422 failure body unchanged", async () => {
    adminSmartAssignBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "b-smart-fail",
      code: "admin_smart_assign_failed",
      message: "All assign attempts failed.",
      httpStatus: 422,
      cause: {
        ok: false,
        error: "All assign attempts failed.",
        attempts: 5,
        escalated: true,
      },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/bookings/b-smart-fail/assign-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "b-smart-fail" }) },
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: "All assign attempts failed.",
      attempts: 5,
      escalated: true,
    });
  });
});
