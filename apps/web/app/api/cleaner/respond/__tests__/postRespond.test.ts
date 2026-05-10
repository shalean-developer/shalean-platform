import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanerAcceptBookingMock, cleanerRejectBookingMock } = vi.hoisted(() => ({
  cleanerAcceptBookingMock: vi.fn(),
  cleanerRejectBookingMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/cleaner/cleanerBookingAccess", () => ({
  cleanerHasBookingAccess: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/booking/bookingOperations", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/booking/bookingOperations")>();
  return {
    ...mod,
    cleanerAcceptBooking: (...args: Parameters<typeof mod.cleanerAcceptBooking>) =>
      cleanerAcceptBookingMock(...args),
    cleanerRejectBooking: (...args: Parameters<typeof mod.cleanerRejectBooking>) =>
      cleanerRejectBookingMock(...args),
  };
});

import { POST } from "../route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";

const BOOKING_ROW = {
  id: "00000000-0000-4000-8000-0000000000a1",
  cleaner_id: "cleaner-respond-1",
  payout_owner_cleaner_id: null,
  team_id: null,
  is_team_job: false,
};

function adminForRespond() {
  return {
    from(table: string) {
      if (table !== "bookings") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: BOOKING_ROW, error: null }),
          }),
        }),
      };
    },
  };
}

describe("POST /api/cleaner/respond", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForRespond() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cleaner-respond-1",
      status: 200,
    } as never);
    cleanerAcceptBookingMock.mockReset();
    cleanerRejectBookingMock.mockReset();
  });

  it("reject calls cleanerRejectBooking and returns JSON/status unchanged", async () => {
    cleanerRejectBookingMock.mockResolvedValue({
      ok: true,
      bookingId: BOOKING_ROW.id,
      data: { ok: true, status: "pending", reassigned: false },
      event: { type: "booking.cleaner_rejected", bookingId: BOOKING_ROW.id },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: BOOKING_ROW.id, action: "reject" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(cleanerRejectBookingMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      cleanerId: "cleaner-respond-1",
      bookingId: BOOKING_ROW.id,
    });
    expect(cleanerAcceptBookingMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ ok: true, status: "pending", reassigned: false });
  });

  it("reject failure maps op cause to response body and status", async () => {
    cleanerRejectBookingMock.mockResolvedValue({
      ok: false,
      bookingId: BOOKING_ROW.id,
      code: "http_400",
      message: "Team jobs cannot be rejected here.",
      httpStatus: 400,
      cause: { error: "Team jobs cannot be rejected here.", code: "TEAM_REJECT_FORBIDDEN" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: BOOKING_ROW.id, action: "reject" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Team jobs cannot be rejected here.",
      code: "TEAM_REJECT_FORBIDDEN",
    });
    expect(cleanerAcceptBookingMock).not.toHaveBeenCalled();
  });

  it("accept calls cleanerAcceptBooking and does not call cleanerRejectBooking", async () => {
    cleanerAcceptBookingMock.mockResolvedValue({
      ok: true,
      bookingId: BOOKING_ROW.id,
      data: { ok: true, status: "pending_payment", cleaner_response_status: "accepted" },
      event: { type: "booking.cleaner_accepted", bookingId: BOOKING_ROW.id },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: BOOKING_ROW.id, action: "accept" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(cleanerRejectBookingMock).not.toHaveBeenCalled();
    expect(cleanerAcceptBookingMock).toHaveBeenCalledWith({
      admin: expect.anything(),
      cleanerId: "cleaner-respond-1",
      bookingId: BOOKING_ROW.id,
    });
    expect(await res.json()).toEqual({
      ok: true,
      status: "pending_payment",
      cleaner_response_status: "accepted",
    });
  });

  it("accept failure maps op cause to response body and status", async () => {
    cleanerAcceptBookingMock.mockResolvedValue({
      ok: false,
      bookingId: BOOKING_ROW.id,
      code: "http_403",
      message: "Not your job.",
      httpStatus: 403,
      cause: { error: "Not your job.", code: "forbidden" },
    });

    const res = await POST(
      new Request("http://localhost/api/cleaner/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: BOOKING_ROW.id, action: "accept" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not your job.", code: "forbidden" });
    expect(cleanerRejectBookingMock).not.toHaveBeenCalled();
  });

  it("respond route does not reference jobs idempotency, notification router, or direct lifecycle helper", () => {
    const p = join(process.cwd(), "app/api/cleaner/respond/route.ts");
    const src = readFileSync(p, "utf8");
    expect(src).not.toContain("cleaner_job_lifecycle_idempotency");
    expect(src).not.toContain("notificationRouter");
    expect(src).not.toContain("idempotency_key");
    expect(src).not.toContain("runCleanerBookingLifecycleAction");
  });
});
