import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { buildDashboardLifecycleAlignmentWire, toCanonicalBookingLifecycleSurface } from "@/lib/booking/readModels/bookingReadModel";

function fixtureRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    date: "2026-06-15",
    time: "09:00",
    payment_completed_at: "2026-06-01T10:00:00.000Z",
    ...over,
  };
}

describe("dashboardLifecycleAlignment", () => {
  it("describeBookingOperationalState operationalPhase matches dashboard wire for all viewers", () => {
    const row = fixtureRow({
      status: "pending_assignment",
      dispatch_status: "offered",
      cleaner_id: null,
      is_team_job: false,
      assignment_type: "user_selected",
      fallback_reason: null,
      payment_needs_follow_up: false,
    });
    const w = buildDashboardLifecycleAlignmentWire(row);
    for (const viewer of ["admin", "customer", "cleaner"] as const) {
      const d = describeBookingOperationalState({ row, viewer });
      expect(d.operationalPhase).toBe(w.operationalPhase);
    }
  });

  it("assigned row: canonical customer surface dashboardAlignment matches standalone wire", () => {
    const row = fixtureRow({
      status: "assigned",
      cleaner_id: "22222222-2222-4222-8222-222222222222",
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
      assignment_type: "user_selected",
      payment_needs_follow_up: true,
      fallback_reason: "cleaner_rejected_offer",
    });
    const wire = buildDashboardLifecycleAlignmentWire(row);
    const canon = toCanonicalBookingLifecycleSurface(row, "customer");
    expect(canon.dashboardAlignment).toEqual(wire);
    expect(canon.operationalPhase).toBe(wire.operationalPhase);
    expect(wire.hasEffectiveAssignee).toBe(true);
    expect(wire.paymentNeedsFollowUp).toBe(true);
    expect(wire.fallbackReason).toBe("cleaner_rejected_offer");
  });

  it("pending_dispatch row shares semantic phase across surfaces when pending offer count is passed consistently", () => {
    const row = fixtureRow({
      status: "pending",
      dispatch_status: "offered",
      cleaner_id: null,
      is_team_job: false,
    });
    const withOffers = buildDashboardLifecycleAlignmentWire(row, { pendingDispatchOfferCount: 1 });
    const without = buildDashboardLifecycleAlignmentWire(row);
    expect(withOffers.assignmentSemanticPhase).toBe(without.assignmentSemanticPhase);
    expect(withOffers.operationalPhase).toBe(without.operationalPhase);
  });
});
