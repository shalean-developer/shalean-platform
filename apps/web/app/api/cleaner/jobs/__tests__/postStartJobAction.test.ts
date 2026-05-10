import { beforeEach, describe, expect, it, vi } from "vitest";

const { markBookingStartedMock } = vi.hoisted(() => ({
  markBookingStartedMock: vi.fn(),
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
    markBookingStarted: (...args: Parameters<typeof mod.markBookingStarted>) => markBookingStartedMock(...args),
  };
});

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => {}),
  reportOperationalIssue: vi.fn(async () => {}),
}));

import { POST } from "../[id]/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

function adminForStartIdempotency() {
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

describe("POST /api/cleaner/jobs/[id] — start", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForStartIdempotency() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cleaner-start-1",
      status: 200,
    } as never);
    markBookingStartedMock.mockReset();
  });

  it("calls markBookingStarted and returns lifecycle JSON unchanged", async () => {
    markBookingStartedMock.mockResolvedValue({
      ok: true,
      bookingId: "b-start-1",
      data: { ok: true, status: "in_progress" },
      event: { type: "booking.started", bookingId: "b-start-1", actor: "cleaner", occurredAt: "t", idempotencyKey: "k" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-start-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", idempotency_key: "test-key-start-b-start-1-1" }),
      }),
      { params: Promise.resolve({ id: "b-start-1" }) },
    );

    expect(res.status).toBe(200);
    expect(markBookingStartedMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      cleanerId: "cleaner-start-1",
      bookingId: "b-start-1",
    });
    expect(await res.json()).toEqual({ ok: true, status: "in_progress" });
  });

  it("returns failure status/body from markBookingStarted", async () => {
    markBookingStartedMock.mockResolvedValue({
      ok: false,
      bookingId: "b-bad",
      code: "http_400",
      message: "Start requires an active assignment or an in-progress job that needs syncing.",
      httpStatus: 400,
      cause: {
        error: "Start requires an active assignment or an in-progress job that needs syncing.",
        code: "start_requires_assigned",
      },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-bad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", idempotency_key: "test-key-start-b-bad-1" }),
      }),
      { params: Promise.resolve({ id: "b-bad" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Start requires an active assignment or an in-progress job that needs syncing.",
      code: "start_requires_assigned",
    });
  });
});
