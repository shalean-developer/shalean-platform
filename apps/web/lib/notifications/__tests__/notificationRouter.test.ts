import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/notifications/notifyBookingEvent", () => ({
  notifyBookingEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/bookingCancelledNotifications", () => ({
  dispatchBookingCancelledNotifications: vi.fn().mockResolvedValue({ dispatched: true }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBookingEvent } from "@/lib/booking/bookingEvents";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { dispatchBookingCancelledNotifications } from "@/lib/notifications/bookingCancelledNotifications";
import { routeBookingNotificationEvent } from "@/lib/notifications/notificationRouter";

const fakeAdmin = {} as SupabaseClient;

describe("routeBookingNotificationEvent", () => {
  beforeEach(() => {
    delete process.env.BOOKING_COMPLETED_ROUTER_ENABLED;
    delete process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED;
    vi.mocked(notifyBookingEvent).mockClear();
    vi.mocked(dispatchBookingCancelledNotifications).mockClear();
  });
  afterEach(() => {
    delete process.env.BOOKING_COMPLETED_ROUTER_ENABLED;
    delete process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED;
  });

  it("no-ops payment_succeeded without routing to channels (finalize flow already notifies)", async () => {
    const event = buildBookingEvent({
      type: "booking.payment_succeeded",
      bookingId: "b1",
      actor: "system",
      externalRef: "pay_ref",
    });
    const r = await routeBookingNotificationEvent(event);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.routed).toBe(false);
    expect(r.routedTo).toEqual([]);
    expect(r.skippedReason).toBe("existing_finalize_flow_already_notifies");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });

  it("booking.cancelled is skipped when BOOKING_NOTIFICATION_ROUTER_ENABLED is off", async () => {
    const event = buildBookingEvent({
      type: "booking.cancelled",
      bookingId: "b2",
      actor: "admin",
    });
    const r = await routeBookingNotificationEvent(event, { admin: fakeAdmin });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.routed).toBe(false);
    expect(r.skippedReason).toBe("booking_notification_router_disabled");
    expect(vi.mocked(dispatchBookingCancelledNotifications)).not.toHaveBeenCalled();
  });

  it("booking.cancelled when BOOKING_NOTIFICATION_ROUTER_ENABLED=1 delegates to dispatch", async () => {
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const event = buildBookingEvent({
      type: "booking.cancelled",
      bookingId: "b-cancel",
      actor: "admin",
    });
    const r = await routeBookingNotificationEvent(event, { admin: fakeAdmin });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.routed).toBe(true);
    expect(vi.mocked(dispatchBookingCancelledNotifications)).toHaveBeenCalledTimes(1);
  });

  it("booking.completed is skipped when BOOKING_COMPLETED_ROUTER_ENABLED is off (no duplicate notify path)", async () => {
    const event = buildBookingEvent({
      type: "booking.completed",
      bookingId: "b-done",
      actor: "cleaner",
      externalRef: "complete",
    });
    const r = await routeBookingNotificationEvent(event, { admin: fakeAdmin });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.skippedReason).toBe("booking_completed_router_disabled");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });

  it("booking.completed when BOOKING_COMPLETED_ROUTER_ENABLED=1 delegates to notifyBookingEvent(completed) exactly once", async () => {
    process.env.BOOKING_COMPLETED_ROUTER_ENABLED = "1";
    const event = buildBookingEvent({
      type: "booking.completed",
      bookingId: "b-done-2",
      actor: "cleaner",
      externalRef: "complete",
    });
    const r = await routeBookingNotificationEvent(event, { admin: fakeAdmin });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.routed).toBe(true);
    expect(r.routedTo).toEqual(["notifyBookingEvent:completed"]);
    expect(vi.mocked(notifyBookingEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyBookingEvent)).toHaveBeenCalledWith({
      type: "completed",
      supabase: fakeAdmin,
      bookingId: "b-done-2",
    });
  });

  it("booking.completed when router enabled fails closed without ctx.admin", async () => {
    process.env.BOOKING_COMPLETED_ROUTER_ENABLED = "1";
    const event = buildBookingEvent({
      type: "booking.completed",
      bookingId: "b-done-3",
      actor: "cron",
      externalRef: "x",
    });
    const r = await routeBookingNotificationEvent(event);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected fail");
    expect(r.code).toBe("booking_completed_router_missing_admin_client");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });

  it("booking.assigned remains unsupported (assignment routing unchanged)", async () => {
    process.env.BOOKING_COMPLETED_ROUTER_ENABLED = "1";
    const event = buildBookingEvent({
      type: "booking.assigned",
      bookingId: "b-asg",
      actor: "admin",
    });
    const r = await routeBookingNotificationEvent(event, { admin: fakeAdmin });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.skippedReason).toBe("unsupported_booking_event_type");
    expect(vi.mocked(notifyBookingEvent)).not.toHaveBeenCalled();
  });
});
