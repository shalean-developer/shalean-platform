import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(
  process.cwd(),
  "app/api/admin/inv-e2e-01d/zoho-repair-apply/route.ts",
);

describe("INV-E2E-01G targeted apply endpoint", () => {
  const source = fs.readFileSync(routePath, "utf8");

  it("requires privileged integration access and explicit confirmation", () => {
    expect(source).toContain('requireAdminPermissionFromRequest(request, "integration.manage")');
    expect(source).toContain('APPLY_INV_E2E_01D_10');
  });

  it("is production-only and locks both Supabase and Zoho identities", () => {
    expect(source).toContain('appEnv !== "production"');
    expect(source).toContain('paqjwfulwywtsyyvdxrq');
    expect(source).toContain('927500285');
  });

  it("delegates only to the hard-allowlisted targeted repair executor", () => {
    expect(source).toContain("runInvE2e01dTargetedRepair(admin)");
    expect(source).not.toContain("processAccountingSyncQueue");
  });
});
