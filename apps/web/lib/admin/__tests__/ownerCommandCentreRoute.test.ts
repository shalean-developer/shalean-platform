import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../../../app/api/admin/owner-command-centre/route.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../../../src/features/office/OfficeRoleDashboard.tsx", import.meta.url), "utf8");

describe("Owner Command Centre production promotion contract", () => {
  it("keeps the aggregate API owner-only", () => {
    expect(routeSource).toContain('requireAdminPermissionFromRequest(request, "role.manage")');
    expect(routeSource).toContain('adminUserHasPermission(auth.user.id, "system.settings")');
    expect(routeSource).toContain('code: "owner_only"');
  });

  it("surfaces the live panel only in the owner role dashboard", () => {
    expect(dashboardSource).toContain("OwnerCommandCentrePanel");
    expect(dashboardSource).toContain('role === "owner"');
  });
});
