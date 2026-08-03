import { describe, expect, it, vi } from "vitest";
import { applyEffectiveBranchScope, NO_BRANCH_ACCESS_UUID } from "./applyEffectiveBranchScope";
import type { EffectiveAdminScope } from "./effectiveAdminScope";

function scope(overrides: Partial<EffectiveAdminScope> = {}): EffectiveAdminScope {
  return {
    userId: "user-1",
    isOwner: false,
    roles: ["operations_admin"],
    permissions: ["booking.view"],
    branches: [],
    teams: [],
    resolvedAt: "2026-08-03T17:00:00.000Z",
    ...overrides,
  };
}

describe("applyEffectiveBranchScope", () => {
  it("does not filter Owner queries", () => {
    const query = { in: vi.fn(), eq: vi.fn() };
    const result = applyEffectiveBranchScope({ query, scope: scope({ isOwner: true, branches: ["*"] }) });

    expect(result).toBe(query);
    expect(query.in).not.toHaveBeenCalled();
    expect(query.eq).not.toHaveBeenCalled();
  });

  it("filters a restricted admin by assigned booking city ids", () => {
    const next = { marker: "filtered" };
    const query = { in: vi.fn().mockReturnValue(next), eq: vi.fn() };
    const branches = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

    const result = applyEffectiveBranchScope({ query, scope: scope({ branches }) });

    expect(query.in).toHaveBeenCalledWith("city_id", branches);
    expect(result).toBe(next);
  });

  it("fails closed when a non-owner has no valid branch assignment", () => {
    const next = { marker: "denied" };
    const query = { in: vi.fn(), eq: vi.fn().mockReturnValue(next) };

    const result = applyEffectiveBranchScope({ query, scope: scope({ branches: [] }) });

    expect(query.eq).toHaveBeenCalledWith("city_id", NO_BRANCH_ACCESS_UUID);
    expect(result).toBe(next);
  });

  it("supports finance tables that use branch_id", () => {
    const query = { in: vi.fn().mockReturnValue({}), eq: vi.fn() };
    const branches = ["33333333-3333-4333-8333-333333333333"];

    applyEffectiveBranchScope({ query, scope: scope({ branches }), column: "branch_id" });

    expect(query.in).toHaveBeenCalledWith("branch_id", branches);
  });
});
