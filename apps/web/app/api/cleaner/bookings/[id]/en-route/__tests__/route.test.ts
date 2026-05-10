import { beforeEach, describe, expect, it, vi } from "vitest";

const { markCleanerOnTheWayMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  markCleanerOnTheWayMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    markCleanerOnTheWay: (...args: Parameters<typeof mod.markCleanerOnTheWay>) => markCleanerOnTheWayMock(...args),
  };
});

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

import { POST } from "../route";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

describe("POST /api/cleaner/bookings/[id]/en-route", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
    markCleanerOnTheWayMock.mockReset();
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
    expect(markCleanerOnTheWayMock).not.toHaveBeenCalled();
  });

  it("calls markCleanerOnTheWay and returns success body unchanged", async () => {
    getSupabaseAdminMock.mockReturnValue({ tag: "admin" } as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cl-1",
      status: 200,
    } as never);
    const bookingId = "00000000-0000-4000-8000-000000000003";
    markCleanerOnTheWayMock.mockResolvedValue({
      ok: true,
      bookingId,
      data: { ok: true, en_route_at: "2026-05-10T10:00:00.000Z" },
      event: { type: "booking.cleaner_on_the_way", bookingId, actor: "cleaner", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: bookingId }),
    });

    expect(res.status).toBe(200);
    expect(markCleanerOnTheWayMock).toHaveBeenCalledWith({
      admin: { tag: "admin" },
      cleanerId: "cl-1",
      bookingId,
    });
    expect(await res.json()).toEqual({
      ok: true,
      en_route_at: "2026-05-10T10:00:00.000Z",
    });
  });

  it("replays failure payload from bookingOperations cause", async () => {
    getSupabaseAdminMock.mockReturnValue({} as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({ cleanerId: "cl-1", status: 200 } as never);
    markCleanerOnTheWayMock.mockResolvedValue({
      ok: false,
      bookingId: "b-x",
      code: "http_400",
      message: "Invalid state for en_route.",
      httpStatus: 400,
      cause: { error: "Invalid state for en_route.", code: "invalid_en_route_state" },
    });

    const res = await POST(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ id: "b-x" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid state for en_route.", code: "invalid_en_route_state" });
  });
});
