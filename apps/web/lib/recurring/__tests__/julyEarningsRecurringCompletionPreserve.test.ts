import { describe, expect, it } from "vitest";

import {
  recurringOccurrenceAssignmentIsCommitted,
  recurringOccurrenceCleanerIdentityOnlyPatch,
  recurringOccurrenceCleanerPatch,
  recurringOccurrenceMustPreserveLifecycle,
  recurringPropagateCleanerOperationalStatus,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import { resolveCommittedRecurringRosterAction } from "@/lib/recurring/applyRecurringOccurrenceRosterContinuity";

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


  it("treats accepted and travelling assignments as committed", () => {
    expect(
      recurringOccurrenceAssignmentIsCommitted({
        cleaner_response_status: "accepted",
      }),
    ).toBe(true);
    expect(
      recurringOccurrenceAssignmentIsCommitted({
        cleaner_response_status: "on_my_way",
      }),
    ).toBe(true);
    expect(
      recurringOccurrenceAssignmentIsCommitted({
        cleaner_response_status: "pending",
        accepted_at: "2026-07-02T10:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      recurringOccurrenceAssignmentIsCommitted({
        status: "in_progress",
        cleaner_response_status: "pending",
      }),
    ).toBe(true);
    expect(
      recurringOccurrenceAssignmentIsCommitted({
        status: "assigned",
        cleaner_response_status: "pending",
      }),
    ).toBe(false);
  });

  it("identity-only patch never writes status=assigned", () => {
    const patch = recurringOccurrenceCleanerIdentityOnlyPatch(CLEANER);
    expect("status" in patch).toBe(false);
    expect("cleaner_response_status" in patch).toBe(false);
    expect("assigned_at" in patch).toBe(false);
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

  it("preserves an accepted paired roster when committed header matches roster lead", () => {
    expect(
      resolveCommittedRecurringRosterAction({
        committedLeadId: CLEANER,
        rosterLeadId: CLEANER,
        rosterCount: 2,
      }),
    ).toBe("preserve_existing_roster");
  });

  it("collapses a stale roster when Direct Assign committed a different cleaner", () => {
    expect(
      resolveCommittedRecurringRosterAction({
        committedLeadId: CLEANER,
        rosterLeadId: "11111111-1111-4111-8111-111111111111",
        rosterCount: 2,
      }),
    ).toBe("collapse_to_committed_header");
  });

  it("repairs a missing committed header from occurrence roster evidence only", () => {
    expect(
      resolveCommittedRecurringRosterAction({
        committedLeadId: null,
        rosterLeadId: CLEANER,
        rosterCount: 2,
      }),
    ).toBe("repair_header_from_roster");
    expect(
      resolveCommittedRecurringRosterAction({
        committedLeadId: null,
        rosterLeadId: null,
        rosterCount: 0,
      }),
    ).toBe("manual_reconciliation");
  });

});
