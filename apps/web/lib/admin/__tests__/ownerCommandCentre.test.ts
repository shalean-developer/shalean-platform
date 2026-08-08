import { describe, expect, it } from "vitest";
import {
  canAccessOwnerCommandCentre,
  emptyOwnerCommandCentreSections,
  formatOwnerCount,
  formatOwnerZar,
  formatOwnerZarFromCents,
  OWNER_COMMAND_CENTRE_SOURCES,
  OWNER_QUICK_ACTIONS,
  ownerQuickActionsForPermissions,
} from "@/lib/admin/ownerCommandCentre";
import { hasAnyOfficePermission, inferOfficeRole, policyForOfficePath } from "@/lib/admin/officeExperience";

const OWNER_PERMISSIONS = [
  "role.manage",
  "system.settings",
  "booking.view",
  "booking.create",
  "booking.assign",
  "customer.view",
  "cleaner.view",
  "team.view",
  "finance.full.view",
  "finance.summary.view",
  "profit.view",
  "payout.view",
  "payout.approve",
  "ops.health.view",
  "audit.view",
] as const;

const MANAGER_PERMISSIONS = [
  "refund.approve.high",
  "finance.summary.view",
  "ops.health.view",
  "booking.view",
  "booking.assign",
  "customer.view",
  "cleaner.view",
  "team.view",
  "payout.view",
  "payout.approve",
] as const;

const SUPERVISOR_PERMISSIONS = ["booking.view", "cleaner.view", "team.view", "team.assign"] as const;

describe("Owner Command Centre access and KPI presentation", () => {
  it("grants company-wide KPI access only to owner-inferred permissions", () => {
    expect(canAccessOwnerCommandCentre(new Set(OWNER_PERMISSIONS))).toBe(true);
    expect(inferOfficeRole(new Set(OWNER_PERMISSIONS))).toBe("owner");
  });

  it("blocks non-owner roles from owner-only figures", () => {
    expect(canAccessOwnerCommandCentre(new Set(MANAGER_PERMISSIONS))).toBe(false);
    expect(canAccessOwnerCommandCentre(new Set(SUPERVISOR_PERMISSIONS))).toBe(false);
    expect(canAccessOwnerCommandCentre(new Set(["finance.full.view", "profit.view"]))).toBe(false);
    expect(canAccessOwnerCommandCentre(new Set(["role.manage"]))).toBe(false);
  });

  it("documents a single source of truth for every KPI key", () => {
    expect(Object.keys(OWNER_COMMAND_CENTRE_SOURCES).length).toBeGreaterThan(15);
    for (const [key, source] of Object.entries(OWNER_COMMAND_CENTRE_SOURCES)) {
      expect(source.trim().length, key).toBeGreaterThan(10);
    }
  });

  it("never silently replaces missing financial data with zero", () => {
    const empty = emptyOwnerCommandCentreSections();
    expect(empty.businessHealth.revenueTodayZar).toBeNull();
    expect(empty.cashFlow.netCashPositionCents).toBeNull();
    expect(empty.todaySnapshot.estimatedGrossProfitCents).toBeNull();
    expect(formatOwnerZar(null)).toBe("Not available");
    expect(formatOwnerZarFromCents(null)).toBe("Not available");
    expect(formatOwnerCount(null)).toBe("Not available");
    expect(formatOwnerZar(0)).toBe("R 0");
    expect(formatOwnerZarFromCents(0)).toBe("R 0");
  });

  it("keeps quick actions permission-scoped", () => {
    const ownerActions = ownerQuickActionsForPermissions(new Set(OWNER_PERMISSIONS));
    expect(ownerActions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["create-booking", "payout-approvals", "cash-flow", "system-health"]),
    );

    const supervisorActions = ownerQuickActionsForPermissions(new Set(SUPERVISOR_PERMISSIONS));
    expect(supervisorActions.some((action) => action.href.includes("cash-flow"))).toBe(false);
    expect(supervisorActions.some((action) => action.href.includes("payouts/approvals"))).toBe(false);

    for (const action of OWNER_QUICK_ACTIONS) {
      const path = action.href.split("?")[0]!;
      const policy = policyForOfficePath(path);
      expect(policy, path).not.toBeNull();
      expect(hasAnyOfficePermission(new Set(OWNER_PERMISSIONS), policy!.anyOf), path).toBe(true);
    }
  });
});
