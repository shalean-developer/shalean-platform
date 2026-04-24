import { describe, it, expect } from "vitest";
import { assignmentSourceLabel } from "@/lib/admin/assignmentDisplay";

describe("assignmentSourceLabel", () => {
  it("labels user_selected", () => {
    expect(
      assignmentSourceLabel({
        cleaner_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        status: "assigned",
        assignment_type: "user_selected",
      }),
    ).toBe("Assigned (user selected)");
  });

  it("labels auto_dispatch and auto_fallback", () => {
    const cid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    expect(assignmentSourceLabel({ cleaner_id: cid, status: "assigned", assignment_type: "auto_dispatch" })).toBe(
      "Assigned (auto)",
    );
    expect(assignmentSourceLabel({ cleaner_id: cid, status: "assigned", assignment_type: "auto_fallback" })).toBe(
      "Assigned (fallback)",
    );
  });

  it("returns null when no cleaner", () => {
    expect(assignmentSourceLabel({ cleaner_id: null, status: "pending", assignment_type: "auto_dispatch" })).toBe(
      null,
    );
  });
});
