import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/performAdminRetryDispatchBooking", () => ({
  performAdminRetryDispatchBooking: vi.fn(),
}));

import { performAdminRetryDispatchBooking } from "@/lib/admin/performAdminRetryDispatchBooking";
import { retryDispatchBooking } from "@/lib/booking/bookingOperations";

const admin = {} as import("@supabase/supabase-js").SupabaseClient;

describe("retryDispatchBooking", () => {
  beforeEach(() => {
    vi.mocked(performAdminRetryDispatchBooking).mockReset();
  });

  it("delegates to performAdminRetryDispatchBooking", async () => {
    vi.mocked(performAdminRetryDispatchBooking).mockResolvedValue({
      status: 200,
      body: { ok: true, assignmentKind: "individual", cleanerId: "cl-1" },
    });
    const out = await retryDispatchBooking({
      admin,
      bookingId: "b-1",
      actorUserId: "u-1",
      actorEmail: "a@b.co",
    });
    expect(performAdminRetryDispatchBooking).toHaveBeenCalledWith({
      admin,
      bookingId: "b-1",
      actorUserId: "u-1",
      actorEmail: "a@b.co",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data).toEqual({ ok: true, assignmentKind: "individual", cleanerId: "cl-1" });
    expect(out.event?.type).toBe("booking.assigned");
    expect(out.event?.bookingId).toBe("b-1");
    expect(out.event?.actor).toBe("admin");
  });

  it("maps non-200 to BookingOperationResult with HTTP cause for route replay", async () => {
    vi.mocked(performAdminRetryDispatchBooking).mockResolvedValue({
      status: 409,
      body: { error: "Booking state changed, refresh and try again." },
    });
    const out = await retryDispatchBooking({
      admin,
      bookingId: "b-2",
      actorUserId: "u-1",
      actorEmail: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(409);
    expect(out.message).toBe("Booking state changed, refresh and try again.");
    expect(out.cause).toEqual({ status: 409, body: { error: "Booking state changed, refresh and try again." } });
  });
});
