import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { policyForOfficePath } from "@/lib/admin/officeExperience";

function readRoute(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("General Manager finance read access contract", () => {
  it("keeps Financial dashboard page and API aligned for summary/full readers", () => {
    const policy = policyForOfficePath("/office/financial-dashboard");
    expect(policy?.anyOf).toEqual(["finance.summary.view", "finance.full.view"]);
    expect(policy?.audience).toContain("manager");

    const source = readRoute("../../../app/api/admin/financial-dashboard/route.ts");
    expect(source).toContain("requireAnyAdminPermissionFromRequest");
    expect(source).toContain('"finance.summary.view"');
    expect(source).toContain('"finance.full.view"');
    expect(source).not.toContain("requireFinanceApi(request)");
  });

  it("keeps Business Health GET readable by summary/full finance roles while POST stays full-finance only", () => {
    const policy = policyForOfficePath("/office/business-health");
    expect(policy?.anyOf).toEqual(["finance.summary.view", "finance.full.view"]);
    expect(policy?.audience).toContain("manager");

    const source = readRoute("../../../app/api/admin/business-health/route.ts");
    expect(source).toContain("requireAnyAdminPermissionFromRequest");
    expect(source).toContain('"finance.summary.view"');
    expect(source).toContain('"finance.full.view"');
    expect(source).toContain('requireAdminPermissionFromRequest(request, "finance.full.view")');
    expect(source).not.toContain("requireFinanceApi(request)");
  });

  it("keeps Expense Reports read API aligned with summary/full finance page policy", () => {
    const policy = policyForOfficePath("/office/expense-reports");
    expect(policy?.anyOf).toEqual(["finance.summary.view", "finance.full.view"]);
    expect(policy?.audience).toContain("manager");

    const source = readRoute("../../../app/api/admin/expenses/reports/route.ts");
    expect(source).toContain("requireAnyAdminPermissionFromRequest");
    expect(source).toContain('"finance.summary.view"');
    expect(source).toContain('"finance.full.view"');
    expect(source).not.toContain("requireFinanceApi(request)");
  });

  it("keeps Payouts period report explicitly gated by payout.view", () => {
    const policy = policyForOfficePath("/office/payouts");
    expect(policy?.anyOf).toEqual(["payout.view"]);
    expect(policy?.audience).toContain("manager");

    const source = readRoute("../../../app/api/admin/payouts/period-report/route.ts");
    expect(source).toContain('requireAdminPermissionFromRequest(request, "payout.view")');
    expect(source).not.toContain("requireAdminApi(request)");
  });
});
