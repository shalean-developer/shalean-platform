import { describe, expect, it } from "vitest";

import { policyForOfficePath } from "@/lib/admin/officeExperience";

describe("Priority 4 Office route audiences", () => {
  it("keeps unscoped inventory out of the Supervisor audience", () => {
    expect(policyForOfficePath("/office/inventory")?.audience).not.toContain("supervisor");
  });

  it("keeps full-finance routes out of the General Manager audience", () => {
    for (const path of [
      "/office/cash-flow",
      "/office/budgets",
      "/office/booking-profitability",
      "/office/expenses",
      "/office/recurring-expenses",
      "/office/expense-vendors",
      "/office/referral-finance",
      "/office/referral-fraud",
      "/office/billing",
    ]) {
      expect(policyForOfficePath(path)?.audience, path).not.toContain("manager");
    }
  });

  it("keeps payout approval owner-only under the live grant model", () => {
    expect(policyForOfficePath("/office/payouts/approvals")?.audience).toEqual(["owner"]);
  });

  it("preserves General Manager summary-finance access", () => {
    for (const path of ["/office/financial-dashboard", "/office/business-health", "/office/expense-reports", "/office/reporting"]) {
      expect(policyForOfficePath(path)?.audience, path).toContain("manager");
    }
  });
});
