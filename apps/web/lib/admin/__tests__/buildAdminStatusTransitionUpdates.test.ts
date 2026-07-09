import { describe, expect, it } from "vitest";
import { buildAdminStatusTransitionUpdates } from "@/lib/admin/buildAdminStatusTransitionUpdates";

describe("buildAdminStatusTransitionUpdates", () => {
  it("sets cancelled_by when moving to cancelled", () => {
    const { updates, nextStatus } = buildAdminStatusTransitionUpdates(
      { status: "assigned", completed_at: null, dispatch_status: "assigned" },
      "cancelled",
    );
    expect(nextStatus).toBe("cancelled");
    expect(updates.status).toBe("cancelled");
    expect(updates.cancelled_by).toBe("system");
  });

  it("clears completed_at when leaving completed for cancelled", () => {
    const { updates } = buildAdminStatusTransitionUpdates(
      {
        status: "completed",
        completed_at: "2026-01-01T12:00:00.000Z",
        dispatch_status: "assigned",
      },
      "cancelled",
    );
    expect(updates.status).toBe("cancelled");
    expect(updates.completed_at).toBeNull();
    expect(updates.cancelled_by).toBe("system");
  });

  it("clears orphan completed_at when assigned row moves to cancelled", () => {
    const { updates } = buildAdminStatusTransitionUpdates(
      {
        status: "assigned",
        completed_at: "2026-01-01T12:00:00.000Z",
        dispatch_status: "assigned",
      },
      "cancelled",
    );
    expect(updates.completed_at).toBeNull();
  });

  it("fills completed_at when marking completed without prior timestamp", () => {
    const { updates } = buildAdminStatusTransitionUpdates(
      { status: "in_progress", completed_at: null, dispatch_status: "assigned" },
      "completed",
    );
    expect(updates.status).toBe("completed");
    expect(typeof updates.completed_at).toBe("string");
  });

  it("records completion-gate override audit when admin completes early", () => {
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const { updates } = buildAdminStatusTransitionUpdates(
      {
        status: "in_progress",
        completed_at: null,
        dispatch_status: "assigned",
        started_at: startedAt,
        duration_minutes: 180,
      },
      "completed",
      { adminEmail: "ops@example.com", completionGateOverrideReason: "Customer signed off early" },
    );
    expect(updates.admin_completion_gate_override_at).toBeTruthy();
    expect(updates.admin_completion_gate_override_by).toBe("ops@example.com");
    expect(updates.admin_completion_gate_override_reason).toBe("Customer signed off early");
    expect(updates.admin_completion_gate_override_codes).toContain("minimum_duration_not_elapsed");
  });
});
