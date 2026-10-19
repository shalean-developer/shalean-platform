import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/cleaner/cleanerBookingAccess", async (original) => ({
  ...await original<object>(), cleanerHasBookingAccess: async () => access.allowed,
}));
vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({ syncCleanerBusyFromBookings: vi.fn() }));
vi.mock("@/lib/notifications/notifyBookingEvent", () => ({ notifyBookingEvent: vi.fn() }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
import { runCleanerBookingLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { CLEANER_LIFECYCLE_CODE } from "@/lib/cleaner/cleanerLifecycleErrors";

function database(overrides: Record<string, unknown>) {
  const booking = { id: "booking", cleaner_id: "cleaner", date: "2026-10-19", time: "09:00", status: "assigned", cleaner_response_status: "pending", accepted_at: null, ...overrides };
  const writes: Record<string, unknown>[] = [];
  const admin = { from: (table: string) => {
    const q = {
      select: () => q, eq: () => q,
      update: (patch: Record<string, unknown>) => { writes.push(patch); return q; },
      maybeSingle: async () => ({ data: table === "bookings" ? booking : null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "booking_cleaners" ? [] : [{ id: booking.id }], error: null }).then(resolve),
    };
    return q;
  } };
  return { admin, booking, writes };
}

beforeEach(() => {
  access.allowed = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("explicit late recurring acceptance", () => {
  it.each([{ is_recurring_generated: true }, { billing_type: "recurring_invoice" }, { billing_type: "monthly_contract" }, { monthly_invoice_id: "invoice" }])("allows the assigned cleaner to accept with %j", async (signal) => {
    const db = database(signal);
    const result = await runCleanerBookingLifecycleAction({ admin: db.admin as never, cleanerId: "cleaner", bookingId: "booking", action: "accept" });
    expect(result).toMatchObject({ status: 200, json: { ok: true, cleaner_response_status: "accepted" } });
    expect(db.writes).toEqual([{ cleaner_response_status: "accepted", accepted_at: "2026-10-19T08:45:00.000Z" }]);
  });

  it("keeps one-off acceptance expired without any writes", async () => {
    const db = database({});
    const result = await runCleanerBookingLifecycleAction({ admin: db.admin as never, cleanerId: "cleaner", bookingId: "booking", action: "accept" });
    expect(result).toMatchObject({ status: 400, json: { code: CLEANER_LIFECYCLE_CODE.ACCEPT_OFFER_EXPIRED } });
    expect(db.writes).toEqual([]);
  });

  it("preserves the assignment access guard", async () => {
    access.allowed = false;
    const db = database({ is_recurring_generated: true });
    expect(await runCleanerBookingLifecycleAction({ admin: db.admin as never, cleanerId: "other", bookingId: "booking", action: "accept" })).toMatchObject({ status: 403 });
    expect(db.writes).toEqual([]);
  });

  it("does not revive a cancelled recurring assignment", async () => {
    const db = database({ is_recurring_generated: true, status: "cancelled" });
    expect(await runCleanerBookingLifecycleAction({ admin: db.admin as never, cleanerId: "cleaner", bookingId: "booking", action: "accept" })).toMatchObject({ status: 400 });
    expect(db.writes).toEqual([]);
  });
});
