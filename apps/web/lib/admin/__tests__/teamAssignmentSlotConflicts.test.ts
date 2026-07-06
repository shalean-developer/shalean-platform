import { describe, expect, it } from "vitest";
import { formatTeamAssignmentSlotConflictError } from "@/lib/admin/teamAssignmentSlotConflicts";

describe("formatTeamAssignmentSlotConflictError", () => {
  it("describes a team slot conflict in plain language", () => {
    expect(
      formatTeamAssignmentSlotConflictError({
        kind: "team",
        dateYmd: "2026-07-13",
        timeHm: "09:00",
        conflict: { id: "x", customer_name: "Joan Van Der Wal Family  Trust", time: "09:00" },
      }),
    ).toContain("already assigned at 2026-07-13 09:00");
  });
});
