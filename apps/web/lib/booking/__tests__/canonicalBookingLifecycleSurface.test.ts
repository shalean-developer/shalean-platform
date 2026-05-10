import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";

function row(p: Record<string, unknown>): Record<string, unknown> {
  return { id: "00000000-0000-4000-8000-000000000001", date: "2026-06-01", time: "10:00", ...p };
}

describe("canonical booking lifecycle surface", () => {
  it("matches operationalPhase, paymentState, recurringState, payoutState, display across admin, customer, and cleaner viewers", () => {
    const r = row({
      status: "assigned",
      cleaner_id: "00000000-0000-4000-8000-000000000002",
      cleaner_response_status: "accepted",
      payment_completed_at: "2026-05-01T08:00:00.000Z",
      payout_status: "pending",
    });
    const viewers = ["admin", "customer", "cleaner"] as const;
    const surfaces = viewers.map((v) => toCanonicalBookingLifecycleSurface(r, v));
    const phases = new Set(surfaces.map((s) => s.operationalPhase));
    const payment = new Set(surfaces.map((s) => s.paymentState));
    const recurring = new Set(surfaces.map((s) => s.recurringState));
    const payout = new Set(surfaces.map((s) => s.payoutState));
    const badges = new Set(surfaces.map((s) => s.displayBadge));
    const tones = new Set(surfaces.map((s) => s.displayTone));
    expect(phases.size).toBe(1);
    expect(payment.size).toBe(1);
    expect(recurring.size).toBe(1);
    expect(payout.size).toBe(1);
    expect(badges.size).toBe(1);
    expect(tones.size).toBe(1);
    expect(phases.has("accepted")).toBe(true);
  });

  it("gives customer viewer no cleaner lifecycle capabilities while admin may mark complete on eligible rows", () => {
    const r = row({
      status: "pending_payment",
      is_recurring_generated: true,
      cleaner_response_status: "accepted",
      accepted_at: "2026-05-01T10:00:00.000Z",
    });
    const admin = describeBookingOperationalState({ row: r, viewer: "admin" });
    const customer = describeBookingOperationalState({ row: r, viewer: "customer" });
    const cleaner = describeBookingOperationalState({ row: r, viewer: "cleaner" });
    expect(admin.operationalPhase).toBe(customer.operationalPhase);
    expect(customer.operationalPhase).toBe(cleaner.operationalPhase);
    expect(admin.lifecycleCapabilities.complete).toBe(true);
    expect(customer.lifecycleCapabilities.complete).toBe(false);
    expect(customer.lifecycleCapabilities).toEqual({
      accept: false,
      reject: false,
      travel: false,
      start: false,
      complete: false,
    });
  });

  it("maps schedule state from date/time presence", () => {
    const full = toCanonicalBookingLifecycleSurface(row({ status: "pending" }), "customer");
    expect(full.scheduleState).toBe("scheduled");
    const missing = toCanonicalBookingLifecycleSurface(row({ status: "pending", date: "", time: "" }), "customer");
    expect(missing.scheduleState).toBe("missing");
  });
});
