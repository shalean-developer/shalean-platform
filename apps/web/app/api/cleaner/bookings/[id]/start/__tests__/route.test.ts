import { beforeEach, describe, expect, it, vi } from "vitest";

const { markBookingStartedMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  markBookingStartedMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    markBookingStarted: (...args: Parameters<typeof mod.markBookingStarted>) => markBookingStartedMock(...args),
  };
});

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

import { POST } from "../route";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

describe("POST /api/cleaner/bookings/[id]/start", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
    markBookingStartedMock.mockReset();
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
    expect(markBookingStartedMock).not.toHaveBeenCalled();
  });

  it("calls markBookingStarted and returns success body unchanged", async () => {
    getSupabaseAdminMock.mockReturnValue({ tag: "admin" } as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cl-1",
      status: 200,
    } as never);
    const bookingId = "00000000-0000-4000-8000-000000000004";
    markBookingStartedMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, status: "in_progress" },
      event: { type: "booking.started", bookingId, actor: "cleaner", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: bookingId }),
    });

    expect(res.status).toBe(200);
    expect(markBookingStartedMock).toHaveBeenCalledWith({
      admin: { tag: "admin" },
      cleanerId: "cl-1",
      bookingId,
    });
    expect(await res.json()).toEqual({ ok: true, status: "in_progress" });
  });

  it("replays failure payload from bookingOperations cause", async () => {
    getSupabaseAdminMock.mockReturnValue({} as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({ cleanerId: "cl-1", status: 200 } as never);
    markBookingStartedMock.mockResolvedValue({
      ok: false,
      bookingId: "b-x",
      code: "http_400",
      message: "Mark on the way before starting the job.",
      httpStatus: 400,
      cause: {
        error: "Mark on the way before starting the job.",
        code: "en_route_required_before_start",
      },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: "b-x" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Mark on the way before starting the job.",
      code: "en_route_required_before_start",
    });
  });
});
