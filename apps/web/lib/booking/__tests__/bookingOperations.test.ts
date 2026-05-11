import { describe, expect, it, vi, beforeEach } from "vitest";
import { toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";

vi.mock("@/lib/booking/finalizePaystackChargeSuccess", () => ({
  finalizePaystackChargeSuccess: vi.fn(),
}));

vi.mock("@/lib/cleaner/runCleanerBookingLifecycleAction", () => ({
  runCleanerBookingLifecycleAction: vi.fn(),
}));

vi.mock("@/lib/admin/performAdminAssignToCleaner", () => ({
  performAdminAssignToCleaner: vi.fn(),
}));

vi.mock("@/lib/admin/runAdminAssignSmart", () => ({
  runAdminAssignSmart: vi.fn(),
}));

vi.mock("@/lib/notifications/notificationRouter", () => {
  const routeBookingNotificationEvent = vi.fn().mockResolvedValue({
    ok: true,
    eventType: "booking.payment_succeeded" as const,
    bookingId: "stub",
    routed: false,
    routedTo: [] as string[],
    skippedReason: "existing_finalize_flow_already_notifies",
  });
  return {
    isBookingNotificationRouterEnabled: () => process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED?.trim() === "1",
    isBookingCompletedRouterEnabled: () => process.env.BOOKING_COMPLETED_ROUTER_ENABLED?.trim() === "1",
    routeBookingNotificationEvent,
  };
});

vi.mock("@/lib/booking/adminMarkBookingPaid", () => ({
  adminMarkBookingPaid: vi.fn(),
  adminRecordBookingDeposit: vi.fn(),
}));

vi.mock("@/lib/booking/adminEditBookingDetails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/adminEditBookingDetails")>();
  return {
    ...actual,
    adminEditBookingDetailsNotesOnly: vi.fn(),
    adminEditBookingDetailsRepricingOnly: vi.fn(),
  };
});

import { finalizePaystackChargeSuccess } from "@/lib/booking/finalizePaystackChargeSuccess";
import { adminMarkBookingPaid, adminRecordBookingDeposit } from "@/lib/booking/adminMarkBookingPaid";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { runCleanerBookingLifecycleAction } from "@/lib/cleaner/runCleanerBookingLifecycleAction";
import { adminEditBookingDetailsNotesOnly, adminEditBookingDetailsRepricingOnly } from "@/lib/booking/adminEditBookingDetails";
import {
  adminAssignCleanerToBooking,
  adminMarkBookingPaidOperation,
  adminRepriceBooking,
  adminSmartAssignBooking,
  adminUpdateBookingNotes,
  cleanerAcceptBooking,
  cleanerRejectBooking,
  finalizePaidBooking,
  markBookingCompleted,
  markBookingStarted,
  markCleanerArrived,
  markCleanerOnTheWay,
} from "@/lib/booking/bookingOperations";
import { routeBookingNotificationEvent } from "@/lib/notifications/notificationRouter";

const admin = {} as import("@supabase/supabase-js").SupabaseClient;

describe("bookingOperations", () => {
  beforeEach(() => {
    vi.mocked(finalizePaystackChargeSuccess).mockReset();
    vi.mocked(runCleanerBookingLifecycleAction).mockReset();
    vi.mocked(performAdminAssignToCleaner).mockReset();
    vi.mocked(runAdminAssignSmart).mockReset();
    vi.mocked(adminMarkBookingPaid).mockReset();
    vi.mocked(adminRecordBookingDeposit).mockReset();
    vi.mocked(adminEditBookingDetailsNotesOnly).mockReset();
    vi.mocked(adminEditBookingDetailsRepricingOnly).mockReset();
    vi.mocked(routeBookingNotificationEvent).mockClear();
    delete process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED;
    delete process.env.BOOKING_COMPLETED_ROUTER_ENABLED;
  });

  it("finalizePaidBooking returns stable success shape and event draft (not dispatched)", async () => {
    vi.mocked(finalizePaystackChargeSuccess).mockResolvedValue({
      ok: true,
      skipped: false,
      bookingId: "b-finalize-1",
      bookingInDatabase: true,
    });
    const out = await finalizePaidBooking({
      source: "verify",
      paystackReference: "ref-1",
      amountCents: 10000,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.bookingId).toBe("b-finalize-1");
    expect(out.data?.bookingId).toBe("b-finalize-1");
    expect(out.event?.type).toBe("booking.payment_succeeded");
    expect(out.event?.bookingId).toBe("b-finalize-1");
    expect(out.event?.actor).toBe("system");
    expect(out.event?.metadata?.paystackReference).toBe("ref-1");
    expect(out.event?.idempotencyKey).toBe("booking.payment_succeeded:b-finalize-1:system:ref-1");
    expect(typeof out.event?.occurredAt).toBe("string");
    expect(vi.mocked(finalizePaystackChargeSuccess)).toHaveBeenCalledWith(
      expect.objectContaining({ source: "verify", paystackReference: "ref-1" }),
    );
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("finalizePaidBooking calls notification router once when BOOKING_NOTIFICATION_ROUTER_ENABLED=1", async () => {
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    vi.mocked(finalizePaystackChargeSuccess).mockResolvedValue({
      ok: true,
      skipped: false,
      bookingId: "b-router-1",
      bookingInDatabase: true,
    });
    const out = await finalizePaidBooking({
      source: "verify",
      paystackReference: "ref-r",
      amountCents: 100,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.ok).toBe(true);
    expect(vi.mocked(routeBookingNotificationEvent)).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(routeBookingNotificationEvent).mock.calls[0]![0];
    expect(arg.type).toBe("booking.payment_succeeded");
    expect(arg.bookingId).toBe("b-router-1");
    expect(arg.idempotencyKey).toContain("ref-r");
  });

  it("finalizePaidBooking maps webhook source to paystack actor", async () => {
    vi.mocked(finalizePaystackChargeSuccess).mockResolvedValue({
      ok: true,
      skipped: true,
      bookingId: "b-2",
      bookingInDatabase: true,
    });
    const out = await finalizePaidBooking({
      source: "webhook",
      paystackReference: "ref-2",
      amountCents: 1,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.actor).toBe("paystack");
    expect(out.event?.idempotencyKey).toBe("booking.payment_succeeded:b-2:paystack:ref-2");
  });

  it("finalizePaidBooking normalizes failure from upsert result", async () => {
    vi.mocked(finalizePaystackChargeSuccess).mockResolvedValue({
      ok: false,
      skipped: true,
      bookingId: "b-bad",
      error: "db exploded",
      reason: "finalization_failed",
    });
    const out = await finalizePaidBooking({
      source: "verify",
      paystackReference: "ref-x",
      amountCents: 1,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.code).toBe("payment_finalization_failed");
    expect(out.message).toContain("db exploded");
    expect(out.bookingId).toBe("b-bad");
    expect(out.cause).toMatchObject({ ok: false });
  });

  it("finalizePaidBooking catches thrown errors from finalize", async () => {
    vi.mocked(finalizePaystackChargeSuccess).mockRejectedValue(new Error("network"));
    const out = await finalizePaidBooking({
      source: "verify",
      paystackReference: "ref-y",
      amountCents: 1,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
      paystackAuthorizationCode: null,
      paystackCustomerCode: null,
      paidAtIso: null,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.code).toBe("finalize_threw");
    expect(out.message).toBe("network");
  });

  it("markBookingCompleted delegates to runCleanerBookingLifecycleAction with complete", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({ status: 200, json: { ok: true, done: true } });
    const out = await markBookingCompleted({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenCalledWith({
      admin,
      cleanerId: "c1",
      bookingId: "b1",
      action: "complete",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.completed");
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("markBookingCompleted calls notification router once for booking.completed when BOOKING_COMPLETED_ROUTER_ENABLED=1", async () => {
    process.env.BOOKING_COMPLETED_ROUTER_ENABLED = "1";
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({ status: 200, json: { ok: true } });
    const out = await markBookingCompleted({ admin, cleanerId: "c9", bookingId: "b9" });
    expect(out.ok).toBe(true);
    expect(vi.mocked(routeBookingNotificationEvent)).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(routeBookingNotificationEvent).mock.calls[0]![0];
    expect(arg.type).toBe("booking.completed");
    expect(arg.bookingId).toBe("b9");
    expect(vi.mocked(routeBookingNotificationEvent).mock.calls[0]![1]).toEqual({ admin });
  });

  it("cleaner lifecycle commands attach httpStatus on failure for route compatibility", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 403,
      json: { error: "Not your job." },
    });
    const out = await cleanerAcceptBooking({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(403);
    expect(out.cause).toEqual({ error: "Not your job." });
  });

  it("maps lifecycle actions for on-the-way, arrived, started", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({ status: 200, json: { ok: true } });
    await markCleanerOnTheWay({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "en_route" }),
    );
    await markCleanerArrived({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: "start" }));
    await markBookingStarted({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenLastCalledWith(expect.objectContaining({ action: "start" }));
  });

  it("markCleanerOnTheWay delegates to runCleanerBookingLifecycleAction and drafts booking.cleaner_on_the_way without routing", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 200,
      json: { ok: true, en_route_at: "2026-05-10T12:00:00.000Z" },
    });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await markCleanerOnTheWay({ admin, cleanerId: "c-en", bookingId: "b-en" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenCalledWith({
      admin,
      cleanerId: "c-en",
      bookingId: "b-en",
      action: "en_route",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.cleaner_on_the_way");
    expect(out.event?.bookingId).toBe("b-en");
    expect(out.event?.actor).toBe("cleaner");
    expect(out.event?.metadata).toEqual({ action: "en_route" });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("markCleanerOnTheWay failure preserves httpStatus and cause body for routes", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 400,
      json: { error: "Invalid state for en_route.", code: "invalid_en_route_state" },
    });
    const out = await markCleanerOnTheWay({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(400);
    expect(out.cause).toEqual({ error: "Invalid state for en_route.", code: "invalid_en_route_state" });
  });

  it("markBookingStarted delegates with action start, drafts booking.started, does not route notifications", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 200,
      json: { ok: true, status: "in_progress" },
    });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await markBookingStarted({ admin, cleanerId: "c-st", bookingId: "b-st" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenCalledWith({
      admin,
      cleanerId: "c-st",
      bookingId: "b-st",
      action: "start",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.started");
    expect(out.event?.bookingId).toBe("b-st");
    expect(out.event?.metadata).toEqual({ action: "start" });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("cleanerRejectBooking delegates with action reject, drafts booking.cleaner_rejected, does not route notifications", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 200,
      json: { ok: true, status: "pending", reassigned: true },
    });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await cleanerRejectBooking({ admin, cleanerId: "c-rj", bookingId: "b-rj" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenCalledWith({
      admin,
      cleanerId: "c-rj",
      bookingId: "b-rj",
      action: "reject",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.cleaner_rejected");
    expect(out.event?.bookingId).toBe("b-rj");
    expect(out.event?.metadata).toEqual({ action: "reject" });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("cleanerRejectBooking failure preserves httpStatus and cause body for routes", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({
      status: 400,
      json: { error: "Team jobs cannot be rejected here.", code: "TEAM_REJECT_FORBIDDEN" },
    });
    const out = await cleanerRejectBooking({ admin, cleanerId: "c1", bookingId: "b1" });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(400);
    expect(out.cause).toEqual({ error: "Team jobs cannot be rejected here.", code: "TEAM_REJECT_FORBIDDEN" });
  });

  it("markCleanerArrived delegates with lifecycle action start and drafts booking.cleaner_arrived without routing", async () => {
    vi.mocked(runCleanerBookingLifecycleAction).mockResolvedValue({ status: 200, json: { ok: true, status: "in_progress" } });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await markCleanerArrived({ admin, cleanerId: "c-arr", bookingId: "b-arr" });
    expect(runCleanerBookingLifecycleAction).toHaveBeenCalledWith({
      admin,
      cleanerId: "c-arr",
      bookingId: "b-arr",
      action: "start",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.event?.type).toBe("booking.cleaner_arrived");
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("adminAssignCleanerToBooking delegates to performAdminAssignToCleaner and drafts booking.assigned without routing", async () => {
    vi.mocked(performAdminAssignToCleaner).mockResolvedValue({
      ok: true,
      cleanerId: "cl-a",
      offerId: "offer-1",
      expiresAtIso: "2026-06-20T12:00:00.000Z",
    });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await adminAssignCleanerToBooking({
      admin,
      bookingId: "b-a",
      cleanerId: "cl-a",
      force: true,
    });
    expect(performAdminAssignToCleaner).toHaveBeenCalledWith(admin, {
      bookingId: "b-a",
      cleanerId: "cl-a",
      force: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data).toEqual({
      ok: true,
      cleanerId: "cl-a",
      offerId: "offer-1",
      expiresAt: "2026-06-20T12:00:00.000Z",
    });
    expect(out.event?.type).toBe("booking.assigned");
    expect(out.event?.actor).toBe("admin");
    expect(out.event?.metadata).toMatchObject({ gateway: "performAdminAssignToCleaner", cleanerId: "cl-a" });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("adminSmartAssignBooking delegates to runAdminAssignSmart and drafts booking.assigned on success without routing", async () => {
    vi.mocked(runAdminAssignSmart).mockResolvedValue({
      ok: true,
      cleanerId: "cl-sm",
      offerId: "offer-sm",
      expiresAt: "2026-09-01T08:00:00.000Z",
      attempts: 2,
    });
    process.env.BOOKING_NOTIFICATION_ROUTER_ENABLED = "1";
    const out = await adminSmartAssignBooking({
      admin,
      bookingId: "b-sm",
      force: false,
      cleanerIds: ["cl-sm"],
    });
    expect(runAdminAssignSmart).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        bookingId: "b-sm",
        force: false,
        cleanerIds: ["cl-sm"],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data).toMatchObject({
      ok: true,
      cleanerId: "cl-sm",
      offerId: "offer-sm",
      expiresAt: "2026-09-01T08:00:00.000Z",
      attempts: 2,
    });
    expect(out.event?.type).toBe("booking.assigned");
    expect(out.event?.metadata).toMatchObject({ gateway: "runAdminAssignSmart", attempts: 2 });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("adminSmartAssignBooking maps failure to 422 cause shape without event", async () => {
    vi.mocked(runAdminAssignSmart).mockResolvedValue({
      ok: false,
      error: "No cleaners in scope for this booking.",
      attempts: 0,
    });
    const out = await adminSmartAssignBooking({
      admin,
      bookingId: "b-fail",
      force: false,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(422);
    expect(out.cause).toEqual({
      ok: false,
      error: "No cleaners in scope for this booking.",
      attempts: 0,
      escalated: false,
    });
  });

  it("adminSmartAssignBooking preserves escalated flag on failure", async () => {
    vi.mocked(runAdminAssignSmart).mockResolvedValue({
      ok: false,
      error: "All assign attempts failed.",
      attempts: 3,
      escalated: true,
    });
    const out = await adminSmartAssignBooking({ admin, bookingId: "b-esc", force: true });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.cause).toEqual({
      ok: false,
      error: "All assign attempts failed.",
      attempts: 3,
      escalated: true,
    });
  });

  it("adminAssignCleanerToBooking maps failure httpStatus and error", async () => {
    vi.mocked(performAdminAssignToCleaner).mockResolvedValue({
      ok: false,
      httpStatus: 400,
      error: "Booking cannot be assigned in this state.",
    });
    const out = await adminAssignCleanerToBooking({
      admin,
      bookingId: "b-x",
      cleanerId: "cl-x",
      force: false,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(400);
    expect(out.cause).toEqual({ error: "Booking cannot be assigned in this state." });
  });

  it("canonical lifecycle read model still derives phase for admin/customer/cleaner on a fixture row", () => {
    const row = {
      id: "fixture-1",
      status: "assigned",
      cleaner_id: "cl-1",
      cleaner_response_status: "accepted",
      date: "2026-08-01",
      time: "10:00",
      payment_completed_at: "2026-07-01T10:00:00.000Z",
      completed_at: null,
      dispatch_status: null,
    };
    const a = toCanonicalBookingLifecycleSurface(row, "admin");
    const c = toCanonicalBookingLifecycleSurface(row, "customer");
    const cl = toCanonicalBookingLifecycleSurface(row, "cleaner");
    expect(a.operationalPhase).toBe(c.operationalPhase);
    expect(c.operationalPhase).toBe(cl.operationalPhase);
    expect(a.dashboardAlignment).toEqual(c.dashboardAlignment);
    expect(c.dashboardAlignment).toEqual(cl.dashboardAlignment);
  });
});

describe("adminMarkBookingPaidOperation", () => {
  const admin = {} as import("@supabase/supabase-js").SupabaseClient;

  beforeEach(() => {
    vi.mocked(adminMarkBookingPaid).mockReset();
    vi.mocked(adminRecordBookingDeposit).mockReset();
  });

  it("delegates deposit mode to adminRecordBookingDeposit only", async () => {
    vi.mocked(adminRecordBookingDeposit).mockResolvedValue({ ok: true, deposit_paid_cents: 2500 });
    const out = await adminMarkBookingPaidOperation({
      admin,
      bookingId: "b-dep",
      adminUserId: "adm-1",
      method: "eft",
      reference: "INV1",
      settlementMode: "deposit",
      depositCents: 2500,
      depositReason: "Deposit",
    });
    expect(vi.mocked(adminRecordBookingDeposit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adminMarkBookingPaid)).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data?.variant).toBe("deposit_recorded");
    expect(out.event).toBeUndefined();
  });

  it("delegates full settlement to adminMarkBookingPaid and attaches draft event", async () => {
    vi.mocked(adminMarkBookingPaid).mockResolvedValue({
      ok: true,
      marked_paid: true,
      settlement: {
        amount_cents: 50000,
        total_paid_zar: 500,
        method: "cash",
        payment_reference_external: null,
        paystack_reference: "cash_b-full",
      },
    });
    const out = await adminMarkBookingPaidOperation({
      admin,
      bookingId: "b-full",
      adminUserId: "adm-1",
      method: "cash",
      settlementMode: "full",
    });
    expect(vi.mocked(adminMarkBookingPaid)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adminRecordBookingDeposit)).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data?.variant).toBe("full_settled");
    expect(out.event?.type).toBe("booking.payment_succeeded");
    expect(out.event?.actor).toBe("admin");
    expect(out.event?.metadata).toMatchObject({
      source: "admin_manual",
      method: "cash",
      settlementMode: "full",
      externalReference: "cash_b-full",
    });
    expect(vi.mocked(routeBookingNotificationEvent)).not.toHaveBeenCalled();
  });

  it("skipped already_paid has no draft event", async () => {
    vi.mocked(adminMarkBookingPaid).mockResolvedValue({ ok: true, skipped: true, reason: "already_paid" });
    const out = await adminMarkBookingPaidOperation({
      admin,
      bookingId: "b-skip",
      adminUserId: "adm-1",
      method: "zoho",
      settlementMode: "full",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data?.variant).toBe("full_skipped");
    expect(out.event).toBeUndefined();
  });

  it("maps adminMarkBookingPaid failure to BookingOperationResult", async () => {
    vi.mocked(adminMarkBookingPaid).mockResolvedValue({
      ok: false,
      error: "Cannot mark paid: booking is cancelled or failed.",
      httpStatus: 400,
    });
    const out = await adminMarkBookingPaidOperation({
      admin,
      bookingId: "b-bad",
      adminUserId: "adm-1",
      method: "cash",
      settlementMode: "full",
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.httpStatus).toBe(400);
    expect(out.message).toContain("cancelled");
  });
});

describe("adminRepriceBooking", () => {
  const admin = {} as import("@supabase/supabase-js").SupabaseClient;

  beforeEach(() => {
    vi.mocked(adminEditBookingDetailsRepricingOnly).mockReset();
  });

  it("delegates to adminEditBookingDetailsRepricingOnly with legacy edit-details result shape", async () => {
    vi.mocked(adminEditBookingDetailsRepricingOnly).mockResolvedValue({
      ok: true,
      new_total: 99_000,
      updated: true,
      payment_mismatch: true,
    });
    const out = await adminRepriceBooking({
      admin,
      bookingId: "22222222-2222-2222-2222-222222222222",
      body: {
        client_updated_at: "2024-02-01T00:00:00Z",
        bedrooms: 3,
        confirm_collect_additional: true,
      },
      adminUserId: "adm-2",
      idempotencyKey: "idem-rp",
    });
    expect(out).toMatchObject({ ok: true, new_total: 99_000, updated: true, payment_mismatch: true });
    expect(adminEditBookingDetailsRepricingOnly).toHaveBeenCalledWith(admin, {
      bookingId: "22222222-2222-2222-2222-222222222222",
      body: {
        client_updated_at: "2024-02-01T00:00:00Z",
        bedrooms: 3,
        confirm_collect_additional: true,
      },
      adminUserId: "adm-2",
      idempotencyKey: "idem-rp",
    });
  });
});

describe("adminUpdateBookingNotes", () => {
  const admin = {} as import("@supabase/supabase-js").SupabaseClient;

  beforeEach(() => {
    vi.mocked(adminEditBookingDetailsNotesOnly).mockReset();
  });

  it("delegates to adminEditBookingDetailsNotesOnly with legacy edit-details result shape", async () => {
    vi.mocked(adminEditBookingDetailsNotesOnly).mockResolvedValue({
      ok: true,
      new_total: 12_500,
      updated: true,
    });
    const out = await adminUpdateBookingNotes({
      admin,
      bookingId: "11111111-1111-1111-1111-111111111111",
      body: { client_updated_at: "2024-01-01T00:00:00Z", notes: "hello" },
      adminUserId: "adm-1",
      idempotencyKey: "idem-1",
    });
    expect(out).toEqual({ ok: true, new_total: 12_500, updated: true });
    expect(adminEditBookingDetailsNotesOnly).toHaveBeenCalledTimes(1);
    expect(adminEditBookingDetailsNotesOnly).toHaveBeenCalledWith(admin, {
      bookingId: "11111111-1111-1111-1111-111111111111",
      body: { client_updated_at: "2024-01-01T00:00:00Z", notes: "hello" },
      adminUserId: "adm-1",
      idempotencyKey: "idem-1",
    });
  });
});
