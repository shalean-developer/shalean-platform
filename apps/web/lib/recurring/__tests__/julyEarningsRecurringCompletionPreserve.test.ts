import { describe, expect, it } from "vitest";

import {
  recurringOccurrenceCleanerIdentityOnlyPatch,
  recurringOccurrenceCleanerPatch,
  recurringOccurrenceMustPreserveLifecycle,
  recurringPropagateCleanerOperationalStatus,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";

const CLEANER = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";

describe("recurring propagate — completed visit lifecycle preservation", () => {
  it("does not collapse completed status to pending operational mode", () => {
    expect(recurringPropagateCleanerOperationalStatus("completed")).toBe("preserve_lifecycle");
    expect(recurringPropagateCleanerOperationalStatus("in_progress")).toBe("preserve_lifecycle");
    expect(recurringPropagateCleanerOperationalStatus("assigned")).toBe("pending");
    expect(recurringPropagateCleanerOperationalStatus("pending_payment")).toBe("pending_payment");
  });

  it("preserves lifecycle when completed_at is set even if status drifted to assigned", () => {
    expect(
      recurringOccurrenceMustPreserveLifecycle({
        status: "assigned",
        completed_at: "2026-07-02T16:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      recurringOccurrenceMustPreserveLifecycle({
        status: "assigned",
        completed_at: null,
      }),
    ).toBe(false);
  });

  it("identity-only patch never writes status=assigned", () => {
    const patch = recurringOccurrenceCleanerIdentityOnlyPatch(CLEANER);
    expect(patch.status).toBeUndefined();
    expect(patch.cleaner_response_status).toBeUndefined();
    expect(patch.assigned_at).toBeUndefined();
    expect(patch.cleaner_id).toBe(CLEANER);
  });

  it("preserve_lifecycle operational status uses identity-only fields", () => {
    const patch = recurringOccurrenceCleanerPatch(CLEANER, { operationalStatus: "preserve_lifecycle" });
    expect(patch).toEqual({
      selected_cleaner_id: CLEANER,
      cleaner_id: CLEANER,
      assignment_type: "user_selected",
    });
    expect("status" in patch).toBe(false);
  });

  it("open pending occurrences still direct-assign to assigned", () => {
    const patch = recurringOccurrenceCleanerPatch(CLEANER, { operationalStatus: "pending" });
    expect(patch.status).toBe("assigned");
    expect(patch.cleaner_response_status).toBe("pending");
  });
});
