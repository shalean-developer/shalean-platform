import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { policyForOfficePath } from "@/lib/admin/officeExperience";

describe("financial dashboard access contract", () => {
  it("keeps page and API authorization aligned for summary/full finance readers", () => {
    const policy = policyForOfficePath("/office/financial-dashboard");
    expect(policy?.anyOf).toEqual(["finance.summary.view", "finance.full.view"]);
    expect(policy?.audience).toContain("manager");
    expect(policy?.audience).toContain("finance");

    const source = readFileSync(
      new URL("../../../app/api/admin/financial-dashboard/route.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("requireAnyAdminPermissionFromRequest");
    expect(source).toContain('"finance.summary.view"');
    expect(source).toContain('"finance.full.view"');
    expect(source).not.toContain("requireFinanceApi(request)");
  });
});
