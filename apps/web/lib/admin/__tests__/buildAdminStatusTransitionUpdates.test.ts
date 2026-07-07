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

  it("fills completed_at when marking completed without prior timestamp", () => {
    const { updates } = buildAdminStatusTransitionUpdates(
      { status: "in_progress", completed_at: null, dispatch_status: "assigned" },
      "completed",
    );
    expect(updates.status).toBe("completed");
    expect(typeof updates.completed_at).toBe("string");
  });

  it("clears cancelled_by when reopening from cancelled", () => {
    const { updates } = buildAdminStatusTransitionUpdates(
      { status: "cancelled", completed_at: null, dispatch_status: null },
      "assigned",
    );
    expect(updates.status).toBe("assigned");
    expect(updates.cancelled_by).toBeNull();
  });
});
