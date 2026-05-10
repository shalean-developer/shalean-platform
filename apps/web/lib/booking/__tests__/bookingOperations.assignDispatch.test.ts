import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dispatch/assignCleaner", () => ({
  assignCleanerToBooking: vi.fn(),
}));
vi.mock("@/lib/dispatch/redispatchAfterOfferReject", () => ({
  maybeRedispatchPendingBookingIfOffersExhausted: vi.fn(),
}));
vi.mock("@/lib/admin/performAdminAssignTeam", () => ({
  performAdminAssignTeam: vi.fn(),
}));

import { assignCleanerToBooking, adminAssignTeamToBooking, redispatchBooking } from "@/lib/booking/bookingOperations";
import { assignCleanerToBooking as dispatchAssignCleanerToBooking } from "@/lib/dispatch/assignCleaner";
import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import { performAdminAssignTeam } from "@/lib/admin/performAdminAssignTeam";

const admin = {} as import("@supabase/supabase-js").SupabaseClient;

describe("bookingOperations dispatch/assignment wrappers", () => {
  beforeEach(() => {
    vi.mocked(dispatchAssignCleanerToBooking).mockReset();
    vi.mocked(maybeRedispatchPendingBookingIfOffersExhausted).mockReset();
    vi.mocked(performAdminAssignTeam).mockReset();
  });

  it("assignCleanerToBooking delegates to dispatch assignCleanerToBooking and returns booking.assigned event on success", async () => {
    vi.mocked(dispatchAssignCleanerToBooking).mockResolvedValue({ ok: true, cleanerId: "cl-x" });
    const out = await assignCleanerToBooking(admin, "b-as-1");
    expect(dispatchAssignCleanerToBooking).toHaveBeenCalledWith(admin, "b-as-1", undefined);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data).toEqual({ ok: true, cleanerId: "cl-x" });
    expect(out.event?.type).toBe("booking.assigned");
    expect(out.event?.bookingId).toBe("b-as-1");
  });

  it("assignCleanerToBooking maps dispatch failure without extra side effects", async () => {
    vi.mocked(dispatchAssignCleanerToBooking).mockResolvedValue({ ok: false, error: "no_candidate", message: "none" });
    const out = await assignCleanerToBooking(admin, "b-fail");
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.code).toBe("no_candidate");
  });

  it("redispatchBooking calls maybeRedispatchPendingBookingIfOffersExhausted and returns cleaner_rejected event draft", async () => {
    vi.mocked(maybeRedispatchPendingBookingIfOffersExhausted).mockResolvedValue(undefined);
    const out = await redispatchBooking({
      admin,
      bookingId: "b-red",
      rejectedCleanerId: "c-rej",
    });
    expect(maybeRedispatchPendingBookingIfOffersExhausted).toHaveBeenCalledWith(admin, {
      bookingId: "b-red",
      rejectedCleanerId: "c-rej",
      reassignmentFallbackReason: undefined,
      skipBackoffScheduling: undefined,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.cleaner_rejected");
  });

  it("adminAssignTeamToBooking delegates to performAdminAssignTeam and attaches booking.assigned on success", async () => {
    vi.mocked(performAdminAssignTeam).mockResolvedValue({ ok: true, teamId: "t-new", oldTeamId: "t-old" });
    const out = await adminAssignTeamToBooking({
      admin,
      bookingId: "b-team",
      teamId: "t-new",
      adminUserId: "adm-1",
    });
    expect(performAdminAssignTeam).toHaveBeenCalledWith({
      admin,
      bookingId: "b-team",
      teamId: "t-new",
      adminUserId: "adm-1",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.assigned");
    expect(out.event?.actor).toBe("admin");
  });

  it("adminAssignTeamToBooking maps failure from performAdminAssignTeam", async () => {
    vi.mocked(performAdminAssignTeam).mockResolvedValue({ ok: false, httpStatus: 400, error: "Invalid teamId." });
    const out = await adminAssignTeamToBooking({
      admin,
      bookingId: "b-bad",
      teamId: "",
      adminUserId: "adm-1",
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(400);
  });
});
