import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanerAcceptBookingMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  cleanerAcceptBookingMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    cleanerAcceptBooking: (...args: Parameters<typeof mod.cleanerAcceptBooking>) => cleanerAcceptBookingMock(...args),
  };
});

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

import { POST } from "../route";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

describe("POST /api/cleaner/bookings/[id]/accept", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
    cleanerAcceptBookingMock.mockReset();
    vi.mocked(resolveCleanerIdFromRequest).mockReset();
  });

  it("returns 401 when session has no cleanerId", async () => {
    getSupabaseAdminMock.mockReturnValue({} as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: null,
      error: "Unauthorized.",
      status: 401,
    });
    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }),
    });
    expect(res.status).toBe(401);
    expect(cleanerAcceptBookingMock).not.toHaveBeenCalled();
  });

  it("calls cleanerAcceptBooking and returns success body unchanged", async () => {
    getSupabaseAdminMock.mockReturnValue({ tag: "admin" } as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cl-1",
      status: 200,
    } as never);
    const bookingId = "00000000-0000-4000-8000-000000000002";
    cleanerAcceptBookingMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, status: "assigned", cleaner_response_status: "accepted" },
      event: { type: "booking.cleaner_accepted", bookingId, actor: "cleaner", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: bookingId }),
    });

    expect(res.status).toBe(200);
    expect(cleanerAcceptBookingMock).toHaveBeenCalledWith({
      admin: { tag: "admin" },
      cleanerId: "cl-1",
      bookingId,
    });
    expect(await res.json()).toEqual({
      ok: true,
      status: "assigned",
      cleaner_response_status: "accepted",
    });
  });

  it("replays failure payload from bookingOperations cause", async () => {
    getSupabaseAdminMock.mockReturnValue({} as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({ cleanerId: "cl-1", status: 200 } as never);
    cleanerAcceptBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "b-x",
      code: "http_403",
      message: "Not allowed.",
      httpStatus: 403,
      cause: { error: "Not allowed.", code: "forbidden" },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: "b-x" }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not allowed.", code: "forbidden" });
  });
});
