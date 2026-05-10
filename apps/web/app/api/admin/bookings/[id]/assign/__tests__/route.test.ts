import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminAssignCleanerToBookingMock, getSupabaseAdminMock, createClientMock } = vi.hoisted(() => ({
  adminAssignCleanerToBookingMock: vi.fn(),
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
    adminAssignCleanerToBooking: (...args: Parameters<typeof mod.adminAssignCleanerToBooking>) =>
      adminAssignCleanerToBookingMock(...args),
  };
});

vi.mock("@/lib/auth/admin", () => ({
  isAdmin: () => true,
}));

import { POST } from "../route";

describe("POST /api/admin/bookings/[id]/assign", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    adminAssignCleanerToBookingMock.mockReset();
    getSupabaseAdminMock.mockReset();
    createClientMock.mockReset();

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: "admin@example.com" } },
        }),
      },
    });

    getSupabaseAdminMock.mockReturnValue({
      from(table: string) {
        if (table === "cleaners") {
          return {
            select: () => ({
              or: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: "00000000-0000-4000-8000-00000000c101" },
                    error: null,
                  }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never);
  });

  it("calls adminAssignCleanerToBooking and returns legacy success JSON", async () => {
    adminAssignCleanerToBookingMock.mockResolvedValue({
      ok: true,
      bookingId: "b-assign-1",
      data: {
        ok: true,
        cleanerId: "00000000-0000-4000-8000-00000000c101",
        offerId: "offer-x",
        expiresAt: "2026-08-01T10:00:00.000Z",
      },
      event: { type: "booking.assigned", bookingId: "b-assign-1", actor: "admin" },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/bookings/b-assign-1/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({ cleanerId: "00000000-0000-4000-8000-00000000c101", force: true }),
      }),
      { params: Promise.resolve({ id: "b-assign-1" }) },
    );

    expect(res.status).toBe(200);
    expect(adminAssignCleanerToBookingMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      bookingId: "b-assign-1",
      cleanerId: "00000000-0000-4000-8000-00000000c101",
      force: true,
    });
    expect(await res.json()).toEqual({
      ok: true,
      cleanerId: "00000000-0000-4000-8000-00000000c101",
      offerId: "offer-x",
      expiresAt: "2026-08-01T10:00:00.000Z",
    });
  });

  it("replays assign failure from bookingOperations", async () => {
    adminAssignCleanerToBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "b-bad",
      code: "admin_assign_cleaner_http_400",
      message: "Cleaner is not eligible.",
      httpStatus: 400,
      cause: { error: "Cleaner is not eligible." },
    });

    const res = await POST(
      new Request("http://localhost/api/admin/bookings/b-bad/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({ cleanerId: "00000000-0000-4000-8000-00000000c101" }),
      }),
      { params: Promise.resolve({ id: "b-bad" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cleaner is not eligible." });
  });
});
