import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanerRejectBookingMock } = vi.hoisted(() => ({
  cleanerRejectBookingMock: vi.fn(),
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
    cleanerRejectBooking: (...args: Parameters<typeof mod.cleanerRejectBooking>) =>
      cleanerRejectBookingMock(...args),
  };
});

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => {}),
  reportOperationalIssue: vi.fn(async () => {}),
}));

import { POST } from "../[id]/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

function adminForRejectIdempotency() {
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

describe("POST /api/cleaner/jobs/[id] — reject", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForRejectIdempotency() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cleaner-reject-1",
      status: 200,
    } as never);
    cleanerRejectBookingMock.mockReset();
  });

  it("calls cleanerRejectBooking and returns lifecycle JSON unchanged", async () => {
    cleanerRejectBookingMock.mockResolvedValue({
      ok: true,
      bookingId: "b-reject-1",
      data: { ok: true, status: "pending", reassigned: true },
      event: {
        type: "booking.cleaner_rejected",
        bookingId: "b-reject-1",
        actor: "cleaner",
        occurredAt: "t",
        idempotencyKey: "k",
      },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-reject-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", idempotency_key: "test-key-reject-b-reject-1-1" }),
      }),
      { params: Promise.resolve({ id: "b-reject-1" }) },
    );

    expect(res.status).toBe(200);
    expect(cleanerRejectBookingMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      cleanerId: "cleaner-reject-1",
      bookingId: "b-reject-1",
    });
    expect(await res.json()).toEqual({ ok: true, status: "pending", reassigned: true });
  });

  it("returns failure status/body from cleanerRejectBooking and rolls back idempotency row", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from(table: string) {
        if (table === "cleaner_job_lifecycle_idempotency") {
          return {
            insert: () => Promise.resolve({ error: null }),
            delete: () => ({ eq: deleteEq }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never);

    cleanerRejectBookingMock.mockResolvedValue({
      ok: false,
      bookingId: "b-bad",
      code: "http_400",
      message: "Team jobs cannot be rejected here.",
      httpStatus: 400,
      cause: { error: "Team jobs cannot be rejected here.", code: "TEAM_REJECT_FORBIDDEN" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-bad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", idempotency_key: "test-key-reject-b-bad-1" }),
      }),
      { params: Promise.resolve({ id: "b-bad" }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Team jobs cannot be rejected here.",
      code: "TEAM_REJECT_FORBIDDEN",
    });
    expect(deleteEq).toHaveBeenCalledWith("idempotency_key", "test-key-reject-b-bad-1");
  });

  it("duplicate idempotency returns unchanged body without calling cleanerRejectBooking", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from(table: string) {
        if (table === "cleaner_job_lifecycle_idempotency") {
          return {
            insert: () =>
              Promise.resolve({
                error: { code: "23505", message: "duplicate key value violates unique constraint" },
              }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never);

    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b-dup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", idempotency_key: "test-key-reject-dup-1" }),
      }),
      { params: Promise.resolve({ id: "b-dup" }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(cleanerRejectBookingMock).not.toHaveBeenCalled();
  });
});
