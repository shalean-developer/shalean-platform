import { describe, expect, it } from "vitest";

import {
  audienceAllowsAnyAssignedRole,
  hasOnlyOfficeRole,
  officeRolesFromAssignments,
  primaryOfficeRole,
} from "@/lib/admin/officeRoleAssignments";

describe("Office multi-role assignment handling", () => {
  it("prioritizes Owner deterministically regardless of assignment order", () => {
    const assignments = [{ code: "general_manager" }, { code: "owner" }];
    expect(primaryOfficeRole(assignments)).toBe("owner");
    expect(officeRolesFromAssignments(assignments)).toEqual(["owner", "manager"]);
  });

  it("allows an Owner-only audience when Owner is one of multiple active roles", () => {
    const roles = officeRolesFromAssignments([{ code: "general_manager" }, { code: "owner" }]);
    expect(audienceAllowsAnyAssignedRole(["owner"], roles)).toBe(true);
  });

  it("does not treat a multi-role Owner plus Supervisor account as Supervisor-only", () => {
    const roles = officeRolesFromAssignments([{ code: "supervisor" }, { code: "owner" }]);
    expect(hasOnlyOfficeRole(roles, "supervisor")).toBe(false);
  });

  it("keeps a true Supervisor-only assignment identifiable", () => {
    const roles = officeRolesFromAssignments([{ code: "supervisor" }]);
    expect(hasOnlyOfficeRole(roles, "supervisor")).toBe(true);
  });
});
