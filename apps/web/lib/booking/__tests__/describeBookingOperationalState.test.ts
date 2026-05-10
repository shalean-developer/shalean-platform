import { describe, expect, it } from "vitest";
import {
  describeBookingOperationalState,
  resolveOperationalBadge,
} from "@/lib/booking/describeBookingOperationalState";

function row(p: Record<string, unknown>): Record<string, unknown> {
  return { id: "00000000-0000-4000-8000-000000000001", ...p };
}

describe("describeBookingOperationalState", () => {
  it("aligns cleaner display badge for recurring unpaid + accepted (same string admin timeline semantics build on)", () => {
    const r = row({
      status: "pending_payment",
      is_recurring_generated: true,
      cleaner_response_status: "accepted",
      accepted_at: "2026-05-01T10:00:00.000Z",
    });
    const cleaner = describeBookingOperationalState({ row: r, viewer: "cleaner" });
    const admin = describeBookingOperationalState({ row: r, viewer: "admin" });
    const customer = describeBookingOperationalState({ row: r, viewer: "customer" });
    expect(customer.displayBadge).toBe(admin.displayBadge);
    expect(customer.operationalPhase).toBe(admin.operationalPhase);
    expect(customer.visibilityMode).toBe("customer_dashboard");
    expect(cleaner.displayBadge).toBe("Awaiting payment confirmation");
    expect(admin.displayBadge).toBe(cleaner.displayBadge);
    expect(cleaner.cleanerLifecycleCapabilities.complete).toBe(false);
    expect(cleaner.cleanerLifecycleCapabilities.accept).toBe(true);
    expect(admin.lifecycleCapabilities.complete).toBe(true);
    expect(admin.canAdminOverride).toBe(true);
  });

  it("marks admin timeline completed when `completed_at` is set even if `status` lags", () => {
    const r = row({
      status: "in_progress",
      completed_at: "2026-05-08T14:00:00.000Z",
      payment_completed_at: "2026-05-01T08:00:00.000Z",
      cleaner_id: "00000000-0000-4000-8000-000000000002",
    });
    const op = describeBookingOperationalState({ row: r, viewer: "admin" });
    expect(op.adminTimeline.completedDone).toBe(true);
    expect(op.adminTimeline.inProgressDone).toBe(true);
  });

  it("admin header badge matches authoritative completion when status lags", () => {
    const r = row({ status: "in_progress", completed_at: "2026-05-08T14:00:00.000Z" });
    const op = describeBookingOperationalState({ row: r, viewer: "admin" });
    expect(op.operationalPhase).toBe("completed");
    expect(op.displayBadge).toBe("Completed");
  });

  it("exposes admin timeline flags consistent with row", () => {
    const r = row({
      status: "in_progress",
      payment_completed_at: "2026-05-01T08:00:00.000Z",
      cleaner_id: "00000000-0000-4000-8000-000000000002",
      assigned_at: "2026-05-01T07:00:00.000Z",
      cleaner_response_status: "accepted",
      started_at: "2026-05-01T09:00:00.000Z",
      payout_status: "pending",
    });
    const op = describeBookingOperationalState({ row: r, viewer: "admin" });
    expect(op.adminTimeline.paidDone).toBe(true);
    expect(op.adminTimeline.assignedDone).toBe(true);
    expect(op.adminTimeline.acceptedDone).toBe(true);
    expect(op.adminTimeline.inProgressDone).toBe(true);
    expect(op.adminTimeline.completedDone).toBe(false);
    expect(op.adminTimeline.payoutPaid).toBe(false);
  });

  it("maps cleaner mobile phase for recurring unpaid + accepted to assigned", () => {
    const r = row({
      status: "pending_payment",
      billing_type: "recurring_invoice",
      cleaner_response_status: "accepted",
    });
    const op = describeBookingOperationalState({ row: r, viewer: "cleaner" });
    expect(op.cleanerMobilePhase).toBe("assigned");
    expect(op.operationalPhase).toBe("pending_payment_recurring");
  });

  it("tags diagnostics with canonical source id", () => {
    const op = describeBookingOperationalState({
      row: row({ status: "pending" }),
      viewer: "cleaner",
    });
    expect(op.diagnostics.operational_state_source).toBe("describeBookingOperationalState");
    expect(op.diagnostics.operational_phase).toBe("pending");
    expect(op.diagnostics.display_badge).toBe(op.displayBadge);
    expect(op.diagnostics.display_tone).toBe(op.displayTone);
    expect(op.overrideApplied).toBe(false);
    expect(op.timelineFlags.adminRecurringUnpaidCompletionOverride).toBe(false);
  });

  it("surfaces persisted admin recurring-unpaid completion override on badge and timeline", () => {
    const r = row({
      status: "completed",
      completed_at: "2026-05-08T12:00:00.000Z",
      admin_recurring_unpaid_completion_override_at: "2026-05-08T12:01:00.000Z",
      admin_recurring_unpaid_completion_override_by: "ops@example.com",
      payout_status: "pending",
    });
    const op = describeBookingOperationalState({ row: r, viewer: "cleaner" });
    expect(op.overrideApplied).toBe(true);
    expect(op.displayBadge).toBe("Completed by admin override");
    expect(op.displayTone).toBe("warning");
    expect(op.timelineSteps.find((s) => s.key === "admin_override")?.done).toBe(true);
    expect(resolveOperationalBadge({ row: r, viewer: "admin" })).toBe("Completed by admin override");
  });
});
