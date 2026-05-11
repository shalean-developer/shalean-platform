import { describe, expect, it } from "vitest";
import { classifyAdminBookingListRow } from "@/lib/admin/adminBookingListClassify";
import {
  adminDispatchNeedsAttention,
  adminDispatchNeedsAttentionFromLifecycle,
  adminLifecycleDispatchCaption,
  adminNeedsFollowUpQueue,
} from "@/lib/admin/adminDashboardLifecycleDisplay";
import { buildDashboardLifecycleAlignmentWire } from "@/lib/booking/readModels/bookingReadModel";
import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";
function listRow(p: Partial<AdminBookingsListRow>): AdminBookingsListRow {
  return {
    id: "b1",
    customer_name: null,
    customer_email: null,
    service: null,
    date: "2026-07-01",
    time: "10:00",
    location: null,
    total_paid_zar: 500,
    amount_paid_cents: 50_000,
    status: "pending",
    dispatch_status: "searching",
    user_id: null,
    cleaner_id: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    paystack_reference: "ref",
    ...p,
  } as AdminBookingsListRow;
}

describe("adminDashboardLifecycleDisplay", () => {
  it("dispatch attention uses lifecycle when pending_assignment + terminal dispatch", () => {
    const base = listRow({
      status: "pending_assignment",
      dispatch_status: "failed",
      cleaner_id: null,
      is_team_job: false,
      team_id: null,
    });
    const dl = buildDashboardLifecycleAlignmentWire(base as unknown as Record<string, unknown>);
    const row = { ...base, dashboardLifecycle: dl };
    expect(adminDispatchNeedsAttention(row)).toBe(true);
    expect(adminDispatchNeedsAttentionFromLifecycle(dl, base)).toBe(true);
  });

  it("dispatch attention legacy fallback matches lifecycle for pending + failed", () => {
    const base = listRow({
      status: "pending",
      dispatch_status: "failed",
      cleaner_id: null,
    });
    expect(adminDispatchNeedsAttention({ ...base, dashboardLifecycle: undefined })).toBe(true);
  });

  it("needs follow-up queue includes payment_needs_follow_up and dispatch terminal via lifecycle", () => {
    const payOnly = listRow({ payment_needs_follow_up: true, dashboardLifecycle: undefined });
    expect(adminNeedsFollowUpQueue(payOnly)).toBe(true);

    const base = listRow({
      status: "pending",
      dispatch_status: "no_cleaner",
      cleaner_id: null,
      payment_needs_follow_up: false,
    });
    const dl = buildDashboardLifecycleAlignmentWire(base as unknown as Record<string, unknown>);
    expect(adminNeedsFollowUpQueue({ ...base, dashboardLifecycle: dl })).toBe(true);
  });

  it("lifecycle caption mentions payment follow-up when flagged on wire", () => {
    const base = listRow({
      status: "assigned",
      dispatch_status: "assigned",
      cleaner_id: "c1",
      payment_needs_follow_up: true,
      cleaner_response_status: "accepted",
    });
    const dl = buildDashboardLifecycleAlignmentWire(base as unknown as Record<string, unknown>);
    expect(dl.paymentNeedsFollowUp).toBe(true);
    expect(adminLifecycleDispatchCaption({ ...base, dashboardLifecycle: dl })).toContain("Payment follow-up");
  });

  it("SLA-style caption uses lifecycle semantics (not the raw dispatch_status token alone)", () => {
    const base = listRow({
      status: "pending",
      dispatch_status: "offered",
      cleaner_id: null,
    });
    const dl = buildDashboardLifecycleAlignmentWire(base as unknown as Record<string, unknown>);
    const cap = adminLifecycleDispatchCaption({ ...base, dashboardLifecycle: dl });
    expect(cap).not.toBe("Offered");
    expect(cap.length).toBeGreaterThan(2);
  });

  it("classifyAdminBookingListRow stays consistent with dashboardLifecycle.operationalPhase for completion", () => {
    const row = {
      status: "completed" as const,
      cleaner_response_status: "completed" as const,
      en_route_at: null,
      started_at: "2026-06-01T08:00:00Z",
      completed_at: "2026-06-01T10:00:00Z",
      dispatch_status: "assigned" as const,
      is_recurring_generated: false as const,
      billing_type: null as null,
      monthly_invoice_id: null as null,
      date: "2026-06-01",
      id: "x",
    };
    const dl = buildDashboardLifecycleAlignmentWire(row as unknown as Record<string, unknown>);
    expect(dl.operationalPhase).toBe("completed");
    expect(classifyAdminBookingListRow(row, "2026-06-02")).toBe("completed");
  });
});
