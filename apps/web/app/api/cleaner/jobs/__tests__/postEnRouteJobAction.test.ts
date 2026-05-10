import { beforeEach, describe, expect, it, vi } from "vitest";

const { markCleanerOnTheWayMock } = vi.hoisted(() => ({
  markCleanerOnTheWayMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    markCleanerOnTheWay: (...args: Parameters<typeof mod.markCleanerOnTheWay>) => markCleanerOnTheWayMock(...args),
  };
});

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => {}),
  reportOperationalIssue: vi.fn(async () => {}),
}));

import { POST } from "../[id]/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

function adminForEnRouteIdempotency() {
  return {
    from(table: string) {
      if (table === "cleaner_job_lifecycle_idempotency") {
        return {
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("POST /api/cleaner/jobs/[id] — en_route", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForEnRouteIdempotency() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cleaner-en-route-1",
      status: 200,
    } as never);
    markCleanerOnTheWayMock.mockReset();
  });

  it("calls markCleanerOnTheWay and returns lifecycle JSON unchanged", async () => {
    markCleanerOnTheWayMock.mockResolvedValue({
      ok: true,
      bookingId: "b-en-1",
      data: { ok: true, en_route_at: "2026-05-10T11:00:00.000Z" },
      event: { type: "booking.cleaner_on_the_way", bookingId: "b-en-1", actor: "cleaner", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-en-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "en_route", idempotency_key: "test-key-en-route-b-en-1-1" }),
      }),
      { params: Promise.resolve({ id: "b-en-1" }) },
    );

    expect(res.status).toBe(200);
    expect(markCleanerOnTheWayMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      cleanerId: "cleaner-en-route-1",
      bookingId: "b-en-1",
    });
    expect(await res.json()).toEqual({ ok: true, en_route_at: "2026-05-10T11:00:00.000Z" });
  });

  it("returns failure status/body from markCleanerOnTheWay", async () => {
    markCleanerOnTheWayMock.mockResolvedValue({
      ok: false,
      bookingId: "b-bad",
      code: "http_403",
      message: "Not your job.",
      httpStatus: 403,
      cause: { error: "Not your job.", code: "forbidden" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-bad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "en_route", idempotency_key: "test-key-en-route-b-bad-1" }),
      }),
      { params: Promise.resolve({ id: "b-bad" }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not your job.", code: "forbidden" });
  });
});
