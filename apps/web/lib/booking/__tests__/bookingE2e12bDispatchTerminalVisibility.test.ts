import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { listBookingAssignmentConsistencyIssues } from "@/lib/dispatch/assignmentLifecycleContract";

describe("BOOKING-E2E-12B dispatch failure and recovery closure", () => {
  it.each(["no_cleaner", "unassignable"])("surfaces terminal dispatch %s as needs assignment", (dispatchStatus) => {
    for (const viewer of ["admin", "customer", "cleaner"] as const) {
      const op = describeBookingOperationalState({
        viewer,
        row: {
          status: "pending_assignment",
          dispatch_status: dispatchStatus,
          cleaner_id: null,
          payment_completed_at: "2026-09-26T06:00:00.000Z",
        },
      });
      expect(op.operationalPhase).toBe("pending");
      expect(op.displayBadge).toBe("Needs assignment");
      expect(op.displayTone).toBe("warning");
    }
  });

  it("does not misclassify terminal dispatch as an assigned lifecycle", () => {
    const issues = listBookingAssignmentConsistencyIssues(
      {
        status: "pending_assignment",
        dispatch_status: "unassignable",
        cleaner_id: null,
        payment_needs_follow_up: true,
      },
      { pendingDispatchOfferCount: 0 },
    );
    expect(issues.some((x) => x.code === "DISPATCH_POST_ASSIGN_BOOKING_STILL_PRE_ASSIGN")).toBe(false);
  });
});
