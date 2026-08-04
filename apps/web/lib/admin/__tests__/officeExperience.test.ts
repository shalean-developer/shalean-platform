import { describe, expect, it } from "vitest";
import {
  OFFICE_ACCESS_POLICIES,
  hasAnyOfficePermission,
  inferOfficeRole,
  policyForOfficePath,
} from "@/lib/admin/officeExperience";

describe("role-based Office experience", () => {
  it("maps every registered path to at least one permission", () => {
    expect(OFFICE_ACCESS_POLICIES.length).toBeGreaterThan(40);
    for (const policy of OFFICE_ACCESS_POLICIES) {
      expect(policy.path.startsWith("/office/")).toBe(true);
      expect(policy.anyOf.length).toBeGreaterThan(0);
      expect(policy.audience.length).toBeGreaterThan(0);
    }
  });

  it("uses the most-specific matching path", () => {
    expect(policyForOfficePath("/office/payouts/approvals")?.anyOf).toEqual(["payout.approve"]);
    expect(policyForOfficePath("/office/payouts/approvals/123")?.anyOf).toEqual(["payout.approve"]);
    expect(policyForOfficePath("/office/payouts")?.anyOf).toEqual(["payout.view"]);
  });

  it("supports any-of permission policies", () => {
    expect(hasAnyOfficePermission(new Set(["finance.full.view"]), ["finance.summary.view", "finance.full.view"])).toBe(true);
    expect(hasAnyOfficePermission(new Set(["booking.view"]), ["finance.summary.view", "finance.full.view"])).toBe(false);
  });

  it("infers the eight supported role experiences", () => {
    expect(inferOfficeRole(new Set(["role.manage", "system.settings"]))).toBe("owner");
    expect(inferOfficeRole(new Set(["refund.approve.high", "finance.summary.view", "ops.health.view"]))).toBe("manager");
    expect(inferOfficeRole(new Set(["finance.full.view"]))).toBe("finance");
    expect(inferOfficeRole(new Set(["booking.assign", "ops.health.view"]))).toBe("operations");
    expect(inferOfficeRole(new Set(["application.decide"]))).toBe("workforce");
    expect(inferOfficeRole(new Set(["marketing.view"]))).toBe("marketing");
    expect(inferOfficeRole(new Set(["customer.contact"]))).toBe("customer-care");
    expect(inferOfficeRole(new Set(["team.assign", "booking.view"]))).toBe("supervisor");
  });

  it("does not expose finance or customer data to a supervisor", () => {
    const supervisor = new Set(["booking.view", "team.view", "team.assign", "cleaner.view"]);
    expect(hasAnyOfficePermission(supervisor, policyForOfficePath("/office/schedule")!.anyOf)).toBe(true);
    expect(hasAnyOfficePermission(supervisor, policyForOfficePath("/office/cash-flow")!.anyOf)).toBe(false);
    expect(hasAnyOfficePermission(supervisor, policyForOfficePath("/office/customers")!.anyOf)).toBe(false);
  });
});
